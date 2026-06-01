// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Response, ResponseStatus, Request} from "./interfaces/IAgentRequester.sol";
import {ILLMInferenceAgent, IParseWebsiteAgent} from "./interfaces/ILLMAgents.sol";

/// @dev Minimal nonReentrant guard matching the OpenZeppelin pattern.
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract AutonomousPredictionMarket is ReentrancyGuard {
    error MarketNotFound();
    error QuestionEmpty();
    error SourceEmpty();
    error QuestionTooLong();
    error SourceTooLong();
    error DurationTooShort();
    error MarketNotOpen();
    error MarketStillActive();
    error MarketEnded();
    error MarketNotResolved();
    error AlreadyRequested();
    error InsufficientContractBalance();
    error BetAmountRequired();
    error NoWinningBets();
    error NoWinningPool();
    error OnlyPlatform();
    error StillPending();
    error UnknownRequest();
    error InvalidStage();
    error InvalidLimit();
    error InvalidInferenceOutput();
    error NoResolverRefund();
    error TransferFailed();

    IAgentRequester public constant PLATFORM = IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant LLM_PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant LLM_PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant MIN_DURATION = 300;
    uint256 public constant MAX_QUESTION_LENGTH = 500;
    uint256 public constant MAX_SOURCE_LENGTH = 300;
    uint256 public constant MAX_AGENT_SCAN_LIMIT = 50;

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

    struct AgentMarketContext {
        uint256 marketId;
        bool exists;
        bool canResolve;
        MarketStatus status;
        uint256 endTime;
        uint256 totalPool;
        uint256 parseRequestId;
        uint256 inferenceRequestId;
        uint256 requiredDeposit;
        uint256 contractBalance;
        uint256 topUpNeeded;
        string question;
        string resolutionSource;
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
        if (bytes(question).length == 0) revert QuestionEmpty();
        if (bytes(resolutionSource).length == 0) revert SourceEmpty();
        if (bytes(question).length > MAX_QUESTION_LENGTH) revert QuestionTooLong();
        if (bytes(resolutionSource).length > MAX_SOURCE_LENGTH) revert SourceTooLong();
        if (durationSeconds < MIN_DURATION) revert DurationTooShort();

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

    function bet(uint256 marketId, BetOption option) external payable nonReentrant {
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.endTime) revert MarketEnded();
        if (msg.value == 0) revert BetAmountRequired();

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
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < market.endTime) revert MarketStillActive();
        if (market.parseRequestId != 0) revert AlreadyRequested();

        (uint256 totalDeposit,,) = getResolutionFundingStatus();
        uint256 balanceBeforeTopUp = address(this).balance - msg.value;
        uint256 topUpNeeded = balanceBeforeTopUp >= totalDeposit ? 0 : totalDeposit - balanceBeforeTopUp;
        uint256 parseDeposit = getParseDeposit();
        if (address(this).balance < totalDeposit) revert InsufficientContractBalance();

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
            uint256 refund = msg.value - topUpNeeded;
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    function handleAgentResponse(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external nonReentrant {
        if (msg.sender != address(PLATFORM)) revert OnlyPlatform();
        if (status == ResponseStatus.Pending || status == ResponseStatus.None) revert StillPending();

        uint256 marketId = requestToMarket[requestId];
        if (marketId == 0) revert UnknownRequest();
        if (requestStage[requestId] != RequestStage.ParseWebsite) revert InvalidStage();

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
    ) external nonReentrant {
        if (msg.sender != address(PLATFORM)) revert OnlyPlatform();

        uint256 marketId = requestToMarket[requestId];
        if (marketId == 0) revert UnknownRequest();
        if (requestStage[requestId] != RequestStage.Inference) revert InvalidStage();

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

    function claimWinnings(uint256 marketId) external nonReentrant {
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Resolved) revert MarketNotResolved();

        uint256 userWinningBets = market.outcome ? userYesBets[msg.sender][marketId] : userNoBets[msg.sender][marketId];
        if (userWinningBets == 0) revert NoWinningBets();

        uint256 totalPool = market.yesTotal + market.noTotal;
        uint256 winningPool = market.outcome ? market.yesTotal : market.noTotal;
        if (winningPool == 0) revert NoWinningPool();

        uint256 winnings = (userWinningBets * totalPool) / winningPool;

        if (market.outcome) {
            userYesBets[msg.sender][marketId] = 0;
        } else {
            userNoBets[msg.sender][marketId] = 0;
        }

        (bool ok,) = payable(msg.sender).call{value: winnings}("");
        if (!ok) revert TransferFailed();
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

    function marketExists(uint256 marketId) public view returns (bool) {
        return marketId > 0 && marketId < nextMarketId && bytes(markets[marketId].question).length > 0;
    }

    function canResolveMarket(uint256 marketId) public view returns (bool) {
        if (!marketExists(marketId)) return false;
        Market storage market = markets[marketId];
        return market.status == MarketStatus.Open && block.timestamp >= market.endTime && market.parseRequestId == 0;
    }

    function getResolutionFundingStatus()
        public
        view
        returns (uint256 requiredDeposit, uint256 contractBalance, uint256 topUpNeeded)
    {
        requiredDeposit = getParseDeposit() + getInferenceDeposit();
        contractBalance = address(this).balance;
        topUpNeeded = contractBalance >= requiredDeposit ? 0 : requiredDeposit - contractBalance;
    }

    function getAgentMarketContext(uint256 marketId) external view returns (AgentMarketContext memory context) {
        (uint256 requiredDeposit, uint256 contractBalance, uint256 topUpNeeded) = getResolutionFundingStatus();
        Market storage market = markets[marketId];

        context = AgentMarketContext({
            marketId: marketId,
            exists: marketExists(marketId),
            canResolve: canResolveMarket(marketId),
            status: market.status,
            endTime: market.endTime,
            totalPool: market.yesTotal + market.noTotal,
            parseRequestId: market.parseRequestId,
            inferenceRequestId: market.inferenceRequestId,
            requiredDeposit: requiredDeposit,
            contractBalance: contractBalance,
            topUpNeeded: topUpNeeded,
            question: market.question,
            resolutionSource: market.resolutionSource
        });
    }

    function scanResolvableMarkets(uint256 cursor, uint256 limit)
        external
        view
        returns (uint256[] memory marketIds, uint256 nextCursor)
    {
        if (limit == 0 || limit > MAX_AGENT_SCAN_LIMIT) revert InvalidLimit();

        uint256 start = cursor < 1 ? 1 : cursor;
        uint256 end = start + limit;
        if (end > nextMarketId) end = nextMarketId;

        uint256 count;
        for (uint256 id = start; id < end; id++) {
            if (canResolveMarket(id)) count++;
        }

        marketIds = new uint256[](count);
        uint256 index;
        for (uint256 id = start; id < end; id++) {
            if (canResolveMarket(id)) {
                marketIds[index++] = id;
            }
        }

        nextCursor = end;
    }

    function agentManifest() external pure returns (string memory) {
        return "AutoResolve agent interface: call scanResolvableMarkets(cursor,limit) to discover expired open markets; call getAgentMarketContext(marketId) for question, source, funding, and request IDs; call requestResolution(marketId) with topUpNeeded STT to trigger the Somnia Parse Website -> LLM Inference resolver pipeline.";
    }
}
