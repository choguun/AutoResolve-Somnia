// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Response, ResponseStatus, Request} from "./interfaces/IAgentRequester.sol";
import {ILLMInferenceAgent, IParseWebsiteAgent} from "./interfaces/ILLMAgents.sol";

contract AutonomousPredictionMarket {
    IAgentRequester public constant PLATFORM = IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant LLM_PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant LLM_PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant MIN_DURATION = 300;

    uint256 public nextMarketId;

    enum MarketStatus {
        Open,
        Resolving,
        Resolved
    }

    enum BetOption {
        Yes,
        No
    }

    enum RequestStage {
        None,
        ParseWebsite,
        Inference
    }

    struct Market {
        address creator;
        string question;
        string resolutionSource;
        uint256 endTime;
        uint256 yesTotal;
        uint256 noTotal;
        MarketStatus status;
        bool outcome;
        string resolutionReason;
        uint256 parseRequestId;
        uint256 inferenceRequestId;
        uint256 resolvedAt;
    }

    struct Bet {
        address better;
        uint256 amount;
        BetOption option;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet[]) public marketBets;
    mapping(address => mapping(uint256 => uint256)) public userYesBets;
    mapping(address => mapping(uint256 => uint256)) public userNoBets;
    mapping(uint256 => uint256) public requestToMarket;
    mapping(uint256 => RequestStage) public requestStage;

    event MarketCreated(
        uint256 indexed marketId, address indexed creator, string question, string resolutionSource, uint256 endTime
    );
    event BetPlaced(uint256 indexed marketId, address indexed better, BetOption option, uint256 amount);
    event ResolutionRequested(uint256 indexed marketId, uint256 requestId, RequestStage stage);
    event MarketResolved(uint256 indexed marketId, bool outcome, string reason, uint256 timestamp);
    event ResolutionFailed(
        uint256 indexed marketId, uint256 indexed requestId, RequestStage stage, ResponseStatus status
    );
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 amount);
    event RebateReceived(uint256 amount);

    constructor() {
        nextMarketId = 1;
    }

    function createMarket(string calldata question, string calldata resolutionSource, uint256 durationSeconds)
        external
        returns (uint256 marketId)
    {
        require(bytes(question).length > 0, "Question required");
        require(bytes(resolutionSource).length > 0, "Source required");
        require(durationSeconds >= MIN_DURATION, "Min 5 min duration");

        marketId = nextMarketId++;
        uint256 endTime = block.timestamp + durationSeconds;

        markets[marketId] = Market({
            creator: msg.sender,
            question: question,
            resolutionSource: resolutionSource,
            endTime: endTime,
            yesTotal: 0,
            noTotal: 0,
            status: MarketStatus.Open,
            outcome: false,
            resolutionReason: "",
            parseRequestId: 0,
            inferenceRequestId: 0,
            resolvedAt: 0
        });

        emit MarketCreated(marketId, msg.sender, question, resolutionSource, endTime);
    }

    function bet(uint256 marketId, BetOption option) external payable {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open, "Market not open");
        require(block.timestamp < market.endTime, "Market ended");
        require(msg.value > 0, "Bet amount required");

        if (option == BetOption.Yes) {
            market.yesTotal += msg.value;
            userYesBets[msg.sender][marketId] += msg.value;
        } else {
            market.noTotal += msg.value;
            userNoBets[msg.sender][marketId] += msg.value;
        }

        marketBets[marketId].push(Bet({better: msg.sender, amount: msg.value, option: option}));

        emit BetPlaced(marketId, msg.sender, option, msg.value);
    }

    function getParseDeposit() public view returns (uint256) {
        return PLATFORM.getRequestDeposit() + (LLM_PARSE_WEBSITE_COST_PER_AGENT * SUBCOMMITTEE_SIZE);
    }

    function getInferenceDeposit() public view returns (uint256) {
        return PLATFORM.getRequestDeposit() + (LLM_INFERENCE_COST_PER_AGENT * SUBCOMMITTEE_SIZE);
    }

    function getResolutionDeposit() external view returns (uint256) {
        return getParseDeposit() + getInferenceDeposit();
    }

    function requestResolution(uint256 marketId) external payable {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open, "Market not open");
        require(block.timestamp >= market.endTime, "Market still active");
        require(market.parseRequestId == 0, "Already requested");

        uint256 parseDeposit = getParseDeposit();
        uint256 inferDeposit = getInferenceDeposit();
        uint256 totalDeposit = parseDeposit + inferDeposit;
        uint256 balanceBeforeTopUp = address(this).balance - msg.value;
        uint256 topUpNeeded = balanceBeforeTopUp >= totalDeposit ? 0 : totalDeposit - balanceBeforeTopUp;
        require(address(this).balance >= totalDeposit, "Insufficient contract balance");

        market.status = MarketStatus.Resolving;

        string[] memory options = new string[](0);
        bytes memory parsePayload = abi.encodeWithSelector(
            IParseWebsiteAgent.ExtractString.selector,
            "outcome",
            string.concat("Extract factual evidence to answer: ", market.question),
            options,
            market.question,
            market.resolutionSource,
            false,
            uint8(1),
            uint8(70)
        );

        uint256 requestId = PLATFORM.createRequest{value: parseDeposit}(
            LLM_PARSE_WEBSITE_AGENT_ID, address(this), this.handleAgentResponse.selector, parsePayload
        );

        market.parseRequestId = requestId;
        requestToMarket[requestId] = marketId;
        requestStage[requestId] = RequestStage.ParseWebsite;

        emit ResolutionRequested(marketId, requestId, RequestStage.ParseWebsite);

        if (msg.value > topUpNeeded) {
            payable(msg.sender).transfer(msg.value - topUpNeeded);
        }
    }

    function handleAgentResponse(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");
        require(status != ResponseStatus.Pending && status != ResponseStatus.None, "Still pending");

        uint256 marketId = requestToMarket[requestId];
        require(marketId > 0, "Unknown request");
        require(requestStage[requestId] == RequestStage.ParseWebsite, "Invalid stage");

        Market storage market = markets[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));
            _resolveWithLLMInference(marketId, result);
            delete requestToMarket[requestId];
            delete requestStage[requestId];
        } else {
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            delete requestToMarket[requestId];
            delete requestStage[requestId];
            emit ResolutionFailed(marketId, requestId, RequestStage.ParseWebsite, status);
        }
    }

    function _resolveWithLLMInference(uint256 marketId, string memory scrapedData) private {
        Market storage market = markets[marketId];

        string memory prompt = string.concat(
            "Based on the following data, answer ONLY 'YES' or 'NO' to this question: ",
            market.question,
            "\n\nData: ",
            scrapedData,
            "\n\nAnswer (YES or NO only):"
        );

        string[] memory allowedValues = new string[](2);
        allowedValues[0] = "YES";
        allowedValues[1] = "NO";

        bytes memory inferPayload = abi.encodeWithSelector(
            ILLMInferenceAgent.inferString.selector,
            prompt,
            "You are a truthful prediction market resolver. Answer only YES or NO.",
            false,
            allowedValues
        );

        uint256 deposit = getInferenceDeposit();

        uint256 requestId = PLATFORM.createRequest{value: deposit}(
            LLM_INFERENCE_AGENT_ID, address(this), this.handleInferenceCallback.selector, inferPayload
        );

        requestToMarket[requestId] = marketId;
        requestStage[requestId] = RequestStage.Inference;
        market.inferenceRequestId = requestId;

        emit ResolutionRequested(marketId, requestId, RequestStage.Inference);
    }

    function handleInferenceCallback(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");

        uint256 marketId = requestToMarket[requestId];
        require(marketId > 0, "Unknown request");
        require(requestStage[requestId] == RequestStage.Inference, "Invalid stage");

        Market storage market = markets[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));
            (bool valid, bool outcome) = _parseYesNo(result);

            if (!valid) {
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.inferenceRequestId = 0;
                emit ResolutionFailed(marketId, requestId, RequestStage.Inference, status);
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                return;
            }

            market.outcome = outcome;
            market.status = MarketStatus.Resolved;
            market.resolutionReason = result;
            market.resolvedAt = block.timestamp;

            emit MarketResolved(marketId, outcome, result, block.timestamp);
        } else {
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.inferenceRequestId = 0;
            emit ResolutionFailed(marketId, requestId, RequestStage.Inference, status);
        }

        delete requestToMarket[requestId];
        delete requestStage[requestId];
    }

    function _parseYesNo(string memory result) private pure returns (bool valid, bool outcome) {
        bytes memory resultBytes = bytes(result);
        if (resultBytes.length >= 3) {
            if (resultBytes[0] == "Y" || resultBytes[0] == "y") return (true, true);
            if (resultBytes[0] == "N" || resultBytes[0] == "n") return (true, false);
        }
        return (false, false);
    }

    function claimWinnings(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Resolved, "Not resolved");

        uint256 userWinningBets = market.outcome ? userYesBets[msg.sender][marketId] : userNoBets[msg.sender][marketId];
        require(userWinningBets > 0, "No winning bets");

        uint256 totalPool = market.yesTotal + market.noTotal;
        uint256 winningPool = market.outcome ? market.yesTotal : market.noTotal;
        require(winningPool > 0, "No winning pool");

        uint256 winnings = (userWinningBets * totalPool) / winningPool;

        if (market.outcome) {
            userYesBets[msg.sender][marketId] = 0;
        } else {
            userNoBets[msg.sender][marketId] = 0;
        }

        payable(msg.sender).transfer(winnings);
        emit WinningsClaimed(marketId, msg.sender, winnings);
    }

    receive() external payable {
        emit RebateReceived(msg.value);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getMarketBets(uint256 marketId) external view returns (Bet[] memory) {
        return marketBets[marketId];
    }

    function getRequiredDeposit() external view returns (uint256) {
        return getParseDeposit() + getInferenceDeposit();
    }

    function getTotalPool(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        return market.yesTotal + market.noTotal;
    }
}
