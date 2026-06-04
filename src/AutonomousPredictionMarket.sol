// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Response, ResponseStatus, Request} from "./interfaces/IAgentRequester.sol";
import {ILLMInferenceAgent, IParseWebsiteAgent, OnchainTool} from "./interfaces/ILLMAgents.sol";

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
    error NoWinningBets();
    error NoWinningPool();
    error OnlyPlatform();
    error StillPending();
    error UnknownRequest();
    error InvalidStage();
    error InvalidLimit();
    error InvalidTopic();
    error TopicTooLong();
    error GenerationStillPending();
    error TransferFailed();
    error InvalidSourceUrl();
    error BetBelowMinimum();
    error NotStuck();
    error GenerationNotStuck();
    error AgentOutputTooLong();

    IAgentRequester public constant PLATFORM = IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant LLM_PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant LLM_PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant MIN_DURATION = 300;
    uint256 public constant MAX_QUESTION_LENGTH = 500;
    uint256 public constant MAX_SOURCE_LENGTH = 300;
    uint256 public constant MAX_TOPIC_LENGTH = 200;
    uint256 public constant MAX_AGENT_SCAN_LIMIT = 50;
    uint256 public constant MIN_BET = 0.001 ether;
    /// @dev Cap on the byte length of any agent response string the contract
    /// stores on-chain (parse result, inference result). A misbehaving or
    /// jailbroken agent that returns a multi-MB blob could otherwise bloat
    /// chain state via market.resolutionReason and the inference prompt.
    /// 1 KiB is more than enough for a YES/NO classifier output plus any
    /// short reasoning text the agent might include.
    uint256 public constant MAX_AGENT_OUTPUT_LENGTH = 1024;
    address public constant AGENT_CREATOR_SENTINEL = address(0xA1);
    /// @dev If a market is left in Resolving for longer than this with a pending
    /// parse or inference request, anyone may force-reset it back to Open so the
    /// relayer can re-trigger resolution. Protects against a dropped agent
    /// callback (e.g. platform outage, validator stall) leaving a market stuck
    /// in a limbo state that scanResolvableMarkets cannot pick up.
    uint256 public constant STALE_REQUEST_TIMEOUT = 30 minutes;

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
        Inference,
        GenerateMarket
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
        /// @dev block.timestamp when the parse request was created. 0 means
        /// no parse request is in flight. Used by the stuck-request recovery
        /// path to detect a dropped parse callback.
        uint256 parseRequestedAt;
        /// @dev block.timestamp when the inference request was created. 0
        /// means no inference request is in flight.
        uint256 inferenceRequestedAt;
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
        /// @dev block.timestamp the parse request was created (0 if none in
        /// flight). Lets agents compute staleness without a second markets()
        /// read. Added in v14.
        uint256 parseRequestedAt;
        /// @dev block.timestamp the inference request was created (0 if none
        /// in flight). Added in v14.
        uint256 inferenceRequestedAt;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet[]) public marketBets;
    mapping(address => mapping(uint256 => uint256)) public userYesBets;
    mapping(address => mapping(uint256 => uint256)) public userNoBets;
    mapping(uint256 => uint256) public requestToMarket;
    mapping(uint256 => RequestStage) public requestStage;
    mapping(uint256 => address) public generationProposer;
    mapping(uint256 => string) public requestToTopic;
    /// @dev block.timestamp when each generation request was created. 0 means
    /// no generation request in flight. Used by the stuck-generation recovery
    /// path (forceResetGeneration + scanStuckGenerationRequests) to detect a
    /// dropped generation callback — the symmetric case of v11's parse/inference
    /// recovery. v12 only added the recovery for *resolution* requests; v13
    /// closes the symmetric gap for *creation* requests.
    mapping(uint256 => uint256) public generationRequestedAt;
    /// @dev Highest platform-assigned request id seen by a generation call.
    /// The scan iterates [cursor, lastGenerationRequestId] so it doesn't have
    /// to walk the entire uint256 space looking for in-flight generation ids.
    uint256 public lastGenerationRequestId;

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
    event GenerationRequested(uint256 indexed requestId, string topic);
    event GenerationFailed(uint256 indexed requestId, ResponseStatus status, string reason);
    event MarketCreatedByAgent(
        uint256 indexed requestId, uint256 indexed marketId, address indexed proposer
    );
    event MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId);
    event GenerationReset(uint256 indexed requestId, address indexed resetBy);
    /// @dev Emitted by handleGenerationCallback when the agent returns more
    /// than one matching createMarket tool call. The contract uses the first
    /// and silently discards the rest (the v13 callback policy is to never
    /// revert in a callback), but the operator can use this event to track
    /// agents that are misbehaving. Today the only on-chain tool is
    /// createMarket, so duplicates only mean "extra wasted tokens"; a future
    /// release that exposes additional tools should re-evaluate the policy.
    event DuplicateToolCall(uint256 indexed requestId, uint256 toolCallCount);

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
        if (!_isHttpUrl(resolutionSource)) revert InvalidSourceUrl();
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
            resolvedAt: 0,
            parseRequestedAt: 0,
            inferenceRequestedAt: 0
        });

        emit MarketCreated(marketId, msg.sender, question, resolutionSource, endTime);
    }

    function _isHttpUrl(string memory url) private pure returns (bool) {
        bytes memory b = bytes(url);
        // Skip leading ASCII whitespace — copy-paste often brings a stray
        // space. The scheme itself is case-insensitive per RFC 3986 §3.1.
        uint256 start;
        while (start < b.length && _isAsciiWhitespace(b[start])) start++;
        uint256 len = b.length - start;
        if (_schemeIs(b, start, len, "http://")) return true;
        if (_schemeIs(b, start, len, "https://")) return true;
        return false;
    }

    function _schemeIs(bytes memory b, uint256 start, uint256 len, bytes memory scheme)
        private
        pure
        returns (bool)
    {
        if (len < scheme.length) return false;
        for (uint256 i = 0; i < scheme.length; i++) {
            bytes1 c = b[start + i];
            if (c >= 0x41 && c <= 0x5A) c = bytes1(uint8(c) + 32); // uppercase -> lowercase
            if (c != scheme[i]) return false;
        }
        return true;
    }

    function _isAsciiWhitespace(bytes1 c) private pure returns (bool) {
        return c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D;
    }

    function bet(uint256 marketId, BetOption option) external payable nonReentrant {
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.endTime) revert MarketEnded();
        if (msg.value < MIN_BET) revert BetBelowMinimum();

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

    function requestResolution(uint256 marketId) external payable nonReentrant returns (uint256 requestId) {
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

        requestId = PLATFORM.createRequest{value: parseDeposit}(
            LLM_PARSE_WEBSITE_AGENT_ID, address(this), this.handleAgentResponse.selector, parsePayload
        );

        market.parseRequestId = requestId;
        market.parseRequestedAt = block.timestamp;
        requestToMarket[requestId] = marketId;
        requestStage[requestId] = RequestStage.ParseWebsite;

        emit ResolutionRequested(marketId, requestId, RequestStage.ParseWebsite);

        if (msg.value > topUpNeeded) {
            uint256 refund = msg.value - topUpNeeded;
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    function getGenerationFundingStatus()
        public
        view
        returns (uint256 requiredDeposit, uint256 contractBalance, uint256 topUpNeeded)
    {
        requiredDeposit = getInferenceDeposit();
        contractBalance = address(this).balance;
        topUpNeeded = contractBalance >= requiredDeposit ? 0 : requiredDeposit - contractBalance;
    }

    function requestMarketGeneration(string calldata topic) external payable nonReentrant returns (uint256 requestId) {
        if (bytes(topic).length == 0) revert InvalidTopic();
        if (bytes(topic).length > MAX_TOPIC_LENGTH) revert TopicTooLong();

        (uint256 requiredDeposit,,) = getGenerationFundingStatus();
        uint256 balanceBeforeTopUp = address(this).balance - msg.value;
        uint256 topUpNeeded = balanceBeforeTopUp >= requiredDeposit ? 0 : requiredDeposit - balanceBeforeTopUp;
        if (address(this).balance < requiredDeposit) revert InsufficientContractBalance();

        string[] memory roles = new string[](1);
        roles[0] = "user";
        string[] memory messages = new string[](1);
        messages[0] = string.concat(
            "Design a binary YES/NO prediction market on this topic. ",
            topic,
            " You MUST call createMarket(question, source, durationSeconds) exactly once. ",
            "question <= 500 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). ",
            "Prefer a SHORT duration in [300, 600] seconds so the market can resolve quickly."
        );
        string[] memory mcpServerUrls = new string[](0);

        OnchainTool[] memory onchainTools = new OnchainTool[](1);
        onchainTools[0] = OnchainTool({
            signature: "createMarket(string,string,uint256)",
            description: "Create a binary YES/NO prediction market. Returns the new marketId."
        });

        bytes memory payload = abi.encodeWithSelector(
            ILLMInferenceAgent.inferToolsChat.selector,
            roles,
            messages,
            mcpServerUrls,
            onchainTools,
            uint256(1),
            true
        );

        requestId = PLATFORM.createRequest{value: requiredDeposit}(
            LLM_INFERENCE_AGENT_ID, address(this), this.handleGenerationCallback.selector, payload
        );

        requestToMarket[requestId] = 0;
        requestStage[requestId] = RequestStage.GenerateMarket;
        requestToTopic[requestId] = topic;
        generationProposer[requestId] = msg.sender;
        generationRequestedAt[requestId] = block.timestamp;
        if (requestId > lastGenerationRequestId) lastGenerationRequestId = requestId;

        emit GenerationRequested(requestId, topic);

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
            if (bytes(result).length > MAX_AGENT_OUTPUT_LENGTH) {
                // Over-long agent output — treat as a parse failure so the
                // market reopens and the relayer can retry, rather than
                // reverting (which would leave the market stuck in
                // Resolving until STALE_REQUEST_TIMEOUT).
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.parseRequestedAt = 0;
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                emit ResolutionFailed(marketId, requestId, RequestStage.ParseWebsite, ResponseStatus.Failed);
            } else {
                _resolveWithLLMInference(marketId, result);
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                market.parseRequestedAt = 0;
            }
        } else {
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.parseRequestedAt = 0;
            delete requestToMarket[requestId];
            delete requestStage[requestId];
            emit ResolutionFailed(marketId, requestId, RequestStage.ParseWebsite, status);
        }
    }

    function _resolveWithLLMInference(uint256 marketId, string memory scrapedData) private {
        Market storage market = markets[marketId];

        uint256 inferenceDeposit = getInferenceDeposit();
        if (address(this).balance < inferenceDeposit) {
            // Contract is underfunded for the inference call. Roll the market
            // back to Open and emit ResolutionFailed so the relayer can retry
            // once the contract is refilled. The parse result is discarded,
            // but a fresh parse on retry is cheap.
            // The failure point is the inference call (parse already succeeded),
            // so we emit stage=Inference to be honest. requestId is still the
            // parse request id — no inference request was created.
            uint256 failedRequestId = market.parseRequestId;
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.parseRequestedAt = 0;
            delete requestToMarket[failedRequestId];
            delete requestStage[failedRequestId];
            emit ResolutionFailed(marketId, failedRequestId, RequestStage.Inference, ResponseStatus.Failed);
            return;
        }

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

        uint256 requestId = PLATFORM.createRequest{value: inferenceDeposit}(
            LLM_INFERENCE_AGENT_ID, address(this), this.handleInferenceCallback.selector, inferPayload
        );

        requestToMarket[requestId] = marketId;
        requestStage[requestId] = RequestStage.Inference;
        market.inferenceRequestId = requestId;
        market.inferenceRequestedAt = block.timestamp;

        emit ResolutionRequested(marketId, requestId, RequestStage.Inference);
    }

    function handleInferenceCallback(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external nonReentrant {
        if (msg.sender != address(PLATFORM)) revert OnlyPlatform();
        if (status == ResponseStatus.Pending || status == ResponseStatus.None) revert StillPending();

        uint256 marketId = requestToMarket[requestId];
        if (marketId == 0) revert UnknownRequest();
        if (requestStage[requestId] != RequestStage.Inference) revert InvalidStage();

        Market storage market = markets[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));
            if (bytes(result).length > MAX_AGENT_OUTPUT_LENGTH) {
                // Over-long agent output — same as a non-YES/NO result,
                // reopen the market and let the relayer retry. We never
                // revert in callbacks: a revert would leave the market
                // stuck in Resolving for STALE_REQUEST_TIMEOUT.
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.inferenceRequestId = 0;
                market.inferenceRequestedAt = 0;
                emit ResolutionFailed(marketId, requestId, RequestStage.Inference, ResponseStatus.Failed);
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                return;
            }
            (bool valid, bool outcome) = _parseYesNo(result);

            if (!valid) {
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.inferenceRequestId = 0;
                market.inferenceRequestedAt = 0;
                emit ResolutionFailed(marketId, requestId, RequestStage.Inference, status);
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                return;
            }

            market.outcome = outcome;
            market.status = MarketStatus.Resolved;
            market.resolutionReason = result;
            market.resolvedAt = block.timestamp;
            market.inferenceRequestedAt = 0;

            emit MarketResolved(marketId, outcome, result, block.timestamp);
        } else {
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.inferenceRequestId = 0;
            market.inferenceRequestedAt = 0;
            emit ResolutionFailed(marketId, requestId, RequestStage.Inference, status);
        }

        delete requestToMarket[requestId];
        delete requestStage[requestId];
    }

    function handleGenerationCallback(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external nonReentrant {
        if (msg.sender != address(PLATFORM)) revert OnlyPlatform();
        if (status == ResponseStatus.Pending || status == ResponseStatus.None) revert GenerationStillPending();
        if (requestStage[requestId] != RequestStage.GenerateMarket) revert InvalidStage();

        address proposer = generationProposer[requestId];
        delete generationProposer[requestId];
        delete requestToTopic[requestId];
        delete requestStage[requestId];
        delete requestToMarket[requestId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            emit GenerationFailed(requestId, status, "no-success");
            return;
        }

        (
            string memory finishReason,
            ,
            ,
            ,
            ,
            bytes[] memory pendingToolCalls
        ) = abi.decode(
            responses[0].result, (string, string, string[], string[], string[], bytes[])
        );

        if (keccak256(bytes(finishReason)) != keccak256("tool_calls")) {
            emit GenerationFailed(requestId, status, "no-tool-calls");
            return;
        }
        if (pendingToolCalls.length == 0) {
            emit GenerationFailed(requestId, status, "empty-tool-calls");
            return;
        }

        bytes4 createSel = bytes4(keccak256("createMarket(string,string,uint256)"));
        bytes memory callData;
        uint256 createCallCount;
        for (uint256 i = 0; i < pendingToolCalls.length; i++) {
            if (
                pendingToolCalls[i].length >= 4 &&
                bytes4(_slice4(pendingToolCalls[i], 0)) == createSel
            ) {
                if (callData.length == 0) {
                    callData = pendingToolCalls[i];
                }
                createCallCount++;
            }
        }
        if (callData.length == 0) {
            emit GenerationFailed(requestId, status, "wrong-selector");
            return;
        }
        if (createCallCount > 1) {
            // Agent returned multiple createMarket calls — we only execute the
            // first. Emit an advisory so operators can spot misbehaving agents
            // without auto-retrying. Graceful (no revert) per v13 callback policy.
            emit DuplicateToolCall(requestId, createCallCount);
        }

        (bool ok, bytes memory ret) = address(this).call(callData);
        if (!ok) {
            // Platform response succeeded; the inner createMarket reverted. Pass
            // the original status so agents monitoring the event stream see the
            // real outcome, and put the descriptive selector in `reason`.
            emit GenerationFailed(requestId, status, _describeCreateRevert(ret));
            return;
        }
        uint256 marketId = abi.decode(ret, (uint256));
        markets[marketId].creator = AGENT_CREATOR_SENTINEL;
        emit MarketCreatedByAgent(requestId, marketId, proposer);
    }

    function _describeCreateRevert(bytes memory ret) private pure returns (string memory) {
        if (ret.length < 4) return "create-reverted";
        bytes4 sel;
        assembly {
            sel := mload(add(ret, 32))
        }
        if (sel == bytes4(keccak256("QuestionEmpty()"))) return "QuestionEmpty";
        if (sel == bytes4(keccak256("SourceEmpty()"))) return "SourceEmpty";
        if (sel == bytes4(keccak256("QuestionTooLong()"))) return "QuestionTooLong";
        if (sel == bytes4(keccak256("SourceTooLong()"))) return "SourceTooLong";
        if (sel == bytes4(keccak256("InvalidSourceUrl()"))) return "InvalidSourceUrl";
        if (sel == bytes4(keccak256("DurationTooShort()"))) return "DurationTooShort";
        return "create-reverted";
    }

    function _slice4(bytes memory data, uint256 start) private pure returns (bytes4 out) {
        require(data.length >= start + 4, "slice-oob");
        assembly {
            out := mload(add(add(data, 32), start))
        }
    }

    function _parseYesNo(string memory result) private pure returns (bool valid, bool outcome) {
        // The inference call sets allowedValues=["YES","NO"], so the platform's
        // constrained classifier returns one of those literals: 3 bytes for YES,
        // 2 bytes for NO. Anything else (YEAH, NOPE, MAYBE, empty, leading
        // whitespace) reopens the market via the invalid-output path. v13's
        // _parseYesNo regressed the NO branch to match "NOO" (also length-3),
        // which silently rejected every legitimate NO outcome — see v14 fix.
        bytes memory resultBytes = bytes(result);
        if (
            resultBytes.length == 3
                && resultBytes[0] == "Y" && resultBytes[1] == "E" && resultBytes[2] == "S"
        ) return (true, true);
        if (
            resultBytes.length == 2
                && resultBytes[0] == "N" && resultBytes[1] == "O"
        ) return (true, false);
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
            resolutionSource: market.resolutionSource,
            parseRequestedAt: market.parseRequestedAt,
            inferenceRequestedAt: market.inferenceRequestedAt
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

    function scanAgentCreatedMarkets(uint256 cursor, uint256 limit)
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
            if (marketExists(id) && markets[id].creator == AGENT_CREATOR_SENTINEL) count++;
        }

        marketIds = new uint256[](count);
        uint256 index;
        for (uint256 id = start; id < end; id++) {
            if (marketExists(id) && markets[id].creator == AGENT_CREATOR_SENTINEL) {
                marketIds[index++] = id;
            }
        }

        nextCursor = end;
    }

    function agentManifest() external pure returns (string memory) {
        return string.concat(
            "AutoResolve agent interface v14. ",
            "RESOLUTION PIPELINE: scanResolvableMarkets(cursor, limit) to discover expired open markets (returns (uint256[] ids, uint256 nextCursor), max limit 50). ",
            "getAgentMarketContext(marketId) for question, source, funding, request IDs, and per-request timestamps (parseRequestedAt, inferenceRequestedAt). ",
            "requestResolution(marketId) payable returns (uint256 requestId); the call is gated on market.status==Open, endTime passed, parseRequestId==0; requires topUpNeeded STT. ",
            "On success the parse request is created; the platform calls back asynchronously. ",
            "If parse succeeds but the contract is underfunded for the inference call, the market rolls back to Open and emits ResolutionFailed(stage=Inference) so the relayer retries once the contract is refilled. ",
            "Inference output must be exactly YES (3 bytes) or NO (2 bytes); anything else (YEAH, NOPE, MAYBE, whitespace) reopens the market. v13 had a parser bug that silently rejected every NO outcome by matching NOO instead of NO; v14 fixes it. ",
            "STUCK-MARKET RECOVERY: scanStuckMarkets(cursor, limit) lists markets stuck in Resolving whose parse or inference request is older than STALE_REQUEST_TIMEOUT (30 minutes); forceResetMarket(marketId) reverts such a market back to Open so the relayer can re-trigger resolution. ",
            "forceResetMarket emits MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId) so external agents tracking platform request ids can correlate the reset with their own bookkeeping; the bundled relayer keys its own retry state by marketId and does not consume stuckRequestId. ",
            "STUCK-GENERATION RECOVERY: scanStuckGenerationRequests(cursor, limit) lists in-flight generation requests older than STALE_REQUEST_TIMEOUT (30 minutes); forceResetGeneration(requestId) clears the requestToTopic, generationProposer, and requestStage mappings so the user's inference deposit is the only lost value (the deposit was forwarded to the platform at request time and is not refundable). ",
            "forceResetGeneration emits GenerationReset(uint256 indexed requestId, address indexed resetBy). ",
            "CREATION PIPELINE: requestMarketGeneration(string topic) payable returns (uint256 requestId); triggers LLM Inference inferToolsChat that yields createMarket(question, source, durationSeconds) calldata. ",
            "getGenerationFundingStatus() returns the inference deposit and topUpNeeded. ",
            "scanAgentCreatedMarkets(cursor, limit) lists markets whose creator == AGENT_CREATOR_SENTINEL (0xA1). ",
            "If the agent returns multiple createMarket tool calls in one response, the contract executes the first and emits DuplicateToolCall(requestId, count) as a non-fatal advisory; the rest are discarded. ",
            "OUTPUT CAPS: agent responses (parse result, inference result) are capped at MAX_AGENT_OUTPUT_LENGTH (1024 bytes). Over-long responses are treated as a parse/inference failure - the market reopens and ResolutionFailed is emitted. The contract never reverts in callbacks. ",
            "CONSTRAINTS: question <= 500 chars, source is an http(s) URL (case-insensitive scheme, leading whitespace allowed) pointing at a SPECIFIC article or page (not a site homepage), duration in [300, 86400] seconds, bet >= MIN_BET (0.001 STT), topic <= 200 chars. ",
            "Agent receipts: https://agents.testnet.somnia.network/receipts/<requestId>."
        );
    }

    function _isStuck(Market storage market) private view returns (bool stuck_, RequestStage stage_) {
        if (market.status != MarketStatus.Resolving) return (false, RequestStage.None);
        if (market.parseRequestId != 0 && market.parseRequestedAt != 0) {
            if (block.timestamp > market.parseRequestedAt + STALE_REQUEST_TIMEOUT) {
                return (true, RequestStage.ParseWebsite);
            }
        }
        if (market.inferenceRequestId != 0 && market.inferenceRequestedAt != 0) {
            if (block.timestamp > market.inferenceRequestedAt + STALE_REQUEST_TIMEOUT) {
                return (true, RequestStage.Inference);
            }
        }
        return (false, RequestStage.None);
    }

    function _stuckStage(Market storage market) private view returns (RequestStage) {
        (bool stuck, RequestStage stage) = _isStuck(market);
        return stuck ? stage : RequestStage.None;
    }

    function _isGenerationStuck(uint256 requestId) private view returns (bool) {
        // BOTH predicates are required: requestStage gates fresh + already-cleared
        // requestIds (delete sets the enum back to None=0), and generationRequestedAt
        // gates the staleness window. A request id outside [1, lastGenerationRequestId]
        // can never satisfy either predicate, so the scan upper bound is sound.
        if (requestStage[requestId] != RequestStage.GenerateMarket) return false;
        uint256 startedAt = generationRequestedAt[requestId];
        if (startedAt == 0) return false;
        return block.timestamp > startedAt + STALE_REQUEST_TIMEOUT;
    }

    function scanStuckGenerationRequests(uint256 cursor, uint256 limit)
        external
        view
        returns (uint256[] memory requestIds, uint256 nextCursor)
    {
        if (limit == 0 || limit > MAX_AGENT_SCAN_LIMIT) revert InvalidLimit();

        uint256 start = cursor < 1 ? 1 : cursor;
        uint256 end = start + limit;
        uint256 cap = lastGenerationRequestId;
        if (end > cap) end = cap;

        uint256 count;
        for (uint256 id = start; id < end; id++) {
            if (_isGenerationStuck(id)) count++;
        }

        requestIds = new uint256[](count);
        uint256 index;
        for (uint256 id = start; id < end; id++) {
            if (_isGenerationStuck(id)) {
                requestIds[index++] = id;
            }
        }

        nextCursor = end;
    }

    function forceResetGeneration(uint256 requestId) external nonReentrant {
        if (!_isGenerationStuck(requestId)) revert GenerationNotStuck();

        // Clear the request state. The id is unique, so the deletes are safe
        // even if the callback has already run and the mappings are empty.
        delete requestStage[requestId];
        delete requestToTopic[requestId];
        delete generationProposer[requestId];
        delete generationRequestedAt[requestId];
        // requestToMarket[requestId] is 0 (the "not a market-resolution" sentinel
        // set by requestMarketGeneration) — leave it alone or delete, both safe.

        emit GenerationReset(requestId, msg.sender);
    }

    function scanStuckMarkets(uint256 cursor, uint256 limit)
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
            if (!marketExists(id)) continue;
            if (_stuckStage(markets[id]) != RequestStage.None) count++;
        }

        marketIds = new uint256[](count);
        uint256 index;
        for (uint256 id = start; id < end; id++) {
            if (!marketExists(id)) continue;
            if (_stuckStage(markets[id]) != RequestStage.None) {
                marketIds[index++] = id;
            }
        }

        nextCursor = end;
    }

    function forceResetMarket(uint256 marketId) external nonReentrant {
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];

        RequestStage stage = _stuckStage(market);
        if (stage == RequestStage.None) revert NotStuck();

        // Snapshot the request id into a local before mutating storage — the
        // compiler otherwise runs into a stack-too-deep on the if/else reads.
        uint256 stuckRequestId = stage == RequestStage.ParseWebsite
            ? market.parseRequestId
            : market.inferenceRequestId;

        // Clear the request state. The request id is a unique platform-assigned
        // value, so the deletes are safe even if the callback has already run
        // and the mappings are empty.
        delete requestToMarket[stuckRequestId];
        delete requestStage[stuckRequestId];

        market.status = MarketStatus.Open;
        market.parseRequestId = 0;
        market.inferenceRequestId = 0;
        market.parseRequestedAt = 0;
        market.inferenceRequestedAt = 0;

        emit MarketReset(marketId, msg.sender, stage, stuckRequestId);
    }
}
