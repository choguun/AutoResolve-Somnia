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
    error DurationTooLong();
    error InferenceNotCached();

    IAgentRequester public constant PLATFORM = IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant LLM_PARSE_WEBSITE_AGENT_ID = 12875401142070969085;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant LLM_PARSE_WEBSITE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant LLM_INFERENCE_COST_PER_AGENT = 0.1 ether;
    uint256 public constant MIN_DURATION = 300;
    /// @dev v16: upper bound on `durationSeconds` in createMarket. The
    /// manifest advertises "[300, 86400] seconds" but v1-v15 only enforced
    /// the lower bound — a creator could mint a market with endTime decades
    /// in the future, and `requestResolution` is gated on `block.timestamp
    /// >= endTime`, so the market would be permanently unresolvable. The
    /// relayer's `forceResetMarket` only operates on Resolving markets, so
    /// it can't recover a fresh Open market that was just minted with a
    /// huge duration. 86400 (1 day) keeps markets resolvable inside the
    /// relayer's STALE_REQUEST_TIMEOUT + a few retry cycles.
    uint256 public constant MAX_DURATION = 86400;
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
    /// @dev v18 (L2): selector for `createMarket(string,string,uint256)`,
    /// precomputed at compile time. handleGenerationCallback matches agent
    /// tool calls against this selector; using a constant avoids recomputing
    /// the keccak on every generation callback.
    bytes4 internal constant CREATE_MARKET_SELECTOR = bytes4(keccak256("createMarket(string,string,uint256)"));
    /// @dev If a market is left in Resolving for longer than this with a pending
    /// parse or inference request, anyone may force-reset it back to Open so the
    /// relayer can re-trigger resolution. Protects against a dropped agent
    /// callback (e.g. platform outage, validator stall) leaving a market stuck
    /// in a limbo state that scanResolvableMarkets cannot pick up.
    uint256 public constant STALE_REQUEST_TIMEOUT = 30 minutes;
    /// @dev Prompt template for the LLM Inference agent's inferToolsChat call
    /// (used by requestMarketGeneration). Exposed via a getter so external
    /// agents can read the exact format the contract expects without having to
    /// decompile the source. The agent is given a single user message:
    ///   "<prefix><topic><suffix>"
    /// where prefix and suffix enforce the market shape (binary YES/NO,
    /// 500-char question, http(s) source URL pointing at a SPECIFIC article
    /// not a homepage).
    /// v60 (H0): the suffix previously read "Prefer a SHORT duration in
    /// [300, 600] seconds so the market can resolve quickly." That
    /// caused the inference agent to ignore the `[duration=N]` suffix
    /// that the relayer + /api/daily-topic template lines include
    /// (e.g. `[duration=86400]` for a daily market). All auto-created
    /// markets ended up with the [300, 600] duration and expired in
    /// 5-10 min, which broke the "daily" cadence. The new suffix
    /// tells the agent to honor the [duration=N] hint if present.
    string public constant GENERATION_PROMPT_PREFIX =
        "Design a binary YES/NO prediction market on this topic. ";
    string public constant GENERATION_PROMPT_SUFFIX =
        " You MUST call createMarket(question, source, durationSeconds) exactly once. "
        "question <= 500 chars. The source URL MUST be a SPECIFIC article or page that directly states the answer to the YES/NO question (e.g. https://en.wikipedia.org/wiki/Paris NOT https://en.wikipedia.org/). "
        "DURATION: if the topic text includes a [duration=N] suffix, use that exact value in seconds. Otherwise pick a duration appropriate for the topic in [300, 86400] seconds (daily / 'this week' / 'tomorrow' topics should use 86400; same-day 'by end of today' topics should use 43200-86400; 'did X already happen' topics should use 300-3600).";

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
        /// @dev true if `marketParseResult[marketId]` is non-empty (i.e. the
        /// parse callback succeeded but the inference call was underfunded,
        /// so a `retryInferenceFromCache` would skip the re-parse). v17
        /// surface addition — the public mapping is reachable directly, but
        /// folding the boolean into the context struct lets external agents
        /// decide whether to invoke the cache-aware retry path from a single
        /// call. The full string is NOT included to keep the struct compact
        /// and avoid bloating every getAgentMarketContext response.
        bool parseResultCached;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet[]) public marketBets;
    mapping(address => mapping(uint256 => uint256)) public userYesBets;
    mapping(address => mapping(uint256 => uint256)) public userNoBets;
    // v40 (L0): per-user enumeration of markets the user has bet on. The My
    // Bets tab on the frontend used to require loading every market page and
    // reading both userYesBets and userNoBets for each to filter for "user
    // has any position". This set lets `getUserMarkets(address)` return the
    // same list in O(K) time where K = the user's position count, eliminating
    // the O(N) tab-switch trigger in app/page.tsx and the corresponding
    // O(N) RPC round-trips on every tab open. The _userMarketIndex uses the
    // 0-sentinel pattern (1-based indices) so the storage cost is 1 SSTORE
    // on first bet, 1 SLOAD on subsequent bets — much cheaper than a linear
    // search through the user's existing positions. claimWinnings does NOT
    // remove from this set; the array tracks "user has bet on this market
    // at some point" and the frontend reads yes/no amounts to determine
    // "active position" vs "history" (a claimed position is yes=0, no=0).
    mapping(address => uint256[]) public userMarketIds;
    mapping(address => mapping(uint256 => uint256)) private _userMarketIndex;
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
    /// @dev v16 (M1): parse-result cache used when the parse callback succeeded
    /// but the contract is underfunded for the inference call. The scraped data
    /// is stored here until `retryInferenceFromCache` (or a fresh
    /// `requestResolution` that happens to hit the same path) re-uses it, or
    /// until a successful inference callback clears it. Empty string means
    /// "nothing cached" — the same convention used by requestToTopic. Public
    /// so `getAgentMarketContext` readers can inspect the cache.
    mapping(uint256 => string) public marketParseResult;

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
    /// @dev Emitted by _resolveWithLLMInference when the parse callback succeeded
    /// but the contract is underfunded for the inference call. The market rolls
    /// back to Open and the parse result is cached in `marketParseResult` so a
    /// later `retryInferenceFromCache(marketId)` can resume from the cached
    /// data without re-running the parse. v15 used to discard the parse result
    /// here, so a re-request had to re-parse the same URL (wasted platform
    /// cycles + relayer EOA gas + a window where the relayer could observe
    /// duplicate ResolutionRequested events for the same market).
    event InferenceUnderfunded(
        uint256 indexed marketId, uint256 indexed parseRequestId, string parseResult
    );

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
        if (durationSeconds > MAX_DURATION) revert DurationTooLong();

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

    // v40 (L0): push (user, marketId) into userMarketIds if not already
    // present. The 0-sentinel pattern in _userMarketIndex lets us check
    // "is present" in O(1) (one SLOAD); the push is also O(1). Re-betting
    // on the same market is a no-op (the user's bet amount is incremented
    // by userYesBets/userNoBets as before, but the set isn't duplicated).
    function _addUserMarketIfAbsent(address user, uint256 marketId) internal {
        if (_userMarketIndex[user][marketId] == 0) {
            userMarketIds[user].push(marketId);
            _userMarketIndex[user][marketId] = userMarketIds[user].length;
        }
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

        // v40 (L0): track (msg.sender, marketId) in userMarketIds so the
        // My Bets tab can enumerate the user's positions without iterating
        // every market. No-op on re-bet (the index sentinel at L195 handles
        // dedup). See getUserMarkets below.
        _addUserMarketIfAbsent(msg.sender, marketId);

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

        // v17 (H1): clear any stale parse-result cache from a previous
        // underfunded-inference cycle. v16 only cleared the cache in
        // retryInferenceFromCache (consume-on-success) and handleInferenceCallback
        // (on every exit), leaving the door open for a stale-cache race: if a
        // new requestResolution is attempted and the fresh parse FAILS, the
        // market rolls back to Open with the OLD cache still populated — at
        // which point a relayer could call retryInferenceFromCache and use
        // the stale result instead of re-parsing. Clearing here (post-funding)
        // preserves the safe invariant: a parse request in flight never has
        // a cache.
        // v28 (L1): moved the clear to AFTER the InsufficientContractBalance
        // check. A failed requestResolution (user manually calls on an
        // underfunded contract, or the relayer's pre-fund check is wrong) used
        // to destroy the cache as a side effect of the revert, removing the
        // relayer's only retry path (retryInferenceFromCache). The post-revert
        // state is now identical to pre-call: cache populated, market Open,
        // no parse request in flight — so a subsequent retryInferenceFromCache
        // on the same market still finds the cache and skips the re-parse.
        delete marketParseResult[marketId];

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
        messages[0] = string.concat(GENERATION_PROMPT_PREFIX, topic, GENERATION_PROMPT_SUFFIX);
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

    /// @notice v16 (M1): resume an inference request from a cached parse result.
    /// @dev When the parse callback succeeded but the contract was underfunded
    /// for the inference call, `_resolveWithLLMInference` cached the scraped
    /// data in `marketParseResult` and rolled the market back to Open. This
    /// function reads that cache and creates only the inference request,
    /// skipping the (wasteful) re-parse. The relayer watches
    /// `InferenceUnderfunded` events and routes them here once the contract
    /// is refilled.
    ///
    /// State preconditions match `requestResolution` for the inference-only
    /// path: market exists, status is Open, endTime has passed, and no parse
    /// or inference request is in flight. The cache must be non-empty (the
    /// only place that writes it is `_resolveWithLLMInference` on the
    /// underfunded path, so an empty cache means the caller is mistaken).
    ///
    /// Funding: only the inference deposit is required (no parse). Any
    /// `msg.value` above the top-up is refunded via the same pattern as
    /// `requestResolution` / `requestMarketGeneration`.
    function retryInferenceFromCache(uint256 marketId)
        external
        payable
        nonReentrant
        returns (uint256 requestId)
    {
        if (!marketExists(marketId)) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < market.endTime) revert MarketStillActive();
        if (market.parseRequestId != 0) revert AlreadyRequested();
        if (market.inferenceRequestId != 0) revert AlreadyRequested();

        string memory cached = marketParseResult[marketId];
        if (bytes(cached).length == 0) revert InferenceNotCached();

        uint256 inferenceDeposit = getInferenceDeposit();
        uint256 balanceBeforeTopUp = address(this).balance - msg.value;
        uint256 topUpNeeded = balanceBeforeTopUp >= inferenceDeposit
            ? 0
            : inferenceDeposit - balanceBeforeTopUp;
        if (address(this).balance < inferenceDeposit) revert InsufficientContractBalance();

        market.status = MarketStatus.Resolving;
        // The cache is consumed here — clear it now so a later
        // forceResetMarket + fresh requestResolution doesn't think the cache
        // is still valid (a fresh parse will produce a new cache entry if it
        // also hits the underfunded path).
        delete marketParseResult[marketId];

        string memory prompt = string.concat(
            "Based on the following data, answer ONLY 'YES' or 'NO' to this question: ",
            market.question,
            "\n\nData: ",
            cached,
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

        requestId = PLATFORM.createRequest{value: inferenceDeposit}(
            LLM_INFERENCE_AGENT_ID, address(this), this.handleInferenceCallback.selector, inferPayload
        );

        requestToMarket[requestId] = marketId;
        requestStage[requestId] = RequestStage.Inference;
        market.inferenceRequestId = requestId;
        market.inferenceRequestedAt = block.timestamp;

        emit ResolutionRequested(marketId, requestId, RequestStage.Inference);

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
                // v18 (M1): symmetric-cleanup invariant from v15/v16/v17
                // also drops the parse-result cache here. The state is
                // unreachable in current code (overlong check runs before
                // _resolveWithLLMInference, so the cache can't be populated
                // in this state), but every exit of every callback should
                // clear it for future-proofing.
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.parseRequestedAt = 0;
                delete marketParseResult[marketId];
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
            // v17 (H1): clear the parse-result cache on the parse-failure path.
            // v16 only cleared on the inference-callback path; a parse failure
            // here would leave the cache intact, so a relayer could call
            // retryInferenceFromCache and use a stale result.
            delete marketParseResult[marketId];
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
            // once the contract is refilled.
            //
            // v16 (M1): cache the parse result in `marketParseResult` and emit
            // `InferenceUnderfunded(parseRequestId, parseResult)`. v1-v15
            // discarded the scrape here, so a retry had to re-parse the same
            // URL. The relayer can now call `retryInferenceFromCache(marketId)`
            // and skip the parse entirely. The cache is cleared on a successful
            // inference callback (or a fresh `requestResolution` overwrites it).
            //
            // The failure point is the inference call (parse already succeeded),
            // so we emit stage=Inference to be honest. requestId is still the
            // parse request id — no inference request was created.
            uint256 failedRequestId = market.parseRequestId;
            marketParseResult[marketId] = scrapedData;
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.parseRequestedAt = 0;
            delete requestToMarket[failedRequestId];
            delete requestStage[failedRequestId];
            emit InferenceUnderfunded(marketId, failedRequestId, scrapedData);
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

        // v19 (H1): symmetric-cleanup invariant from v15/v16/v17/v18 extended
        // to every exit of handleInferenceCallback. The v16 M1 fix put
        // `delete marketParseResult[marketId]` at the bottom of the function,
        // but the overlong + invalid branches `return` before reaching it.
        // A future retryInferenceFromCache would then skip the re-parse and
        // hit a guaranteed InferenceNotCached revert. Hoisting the delete
        // here makes the invariant unconditional — any future branch added
        // to this callback inherits it for free.
        delete marketParseResult[marketId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));
            if (bytes(result).length > MAX_AGENT_OUTPUT_LENGTH) {
                // Over-long agent output — same as a non-YES/NO result,
                // reopen the market and let the relayer retry. We never
                // revert in callbacks: a revert would leave the market
                // stuck in Resolving for STALE_REQUEST_TIMEOUT. v15: also
                // clear parseRequestedAt — the parse already succeeded, so
                // there is no parse request in flight, and leaving the old
                // timestamp would mislead getAgentMarketContext readers
                // (they would see parseRequestedAt != 0 for an Open market).
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.parseRequestedAt = 0;
                market.inferenceRequestId = 0;
                market.inferenceRequestedAt = 0;
                emit ResolutionFailed(marketId, requestId, RequestStage.Inference, ResponseStatus.Failed);
                delete requestToMarket[requestId];
                delete requestStage[requestId];
                return;
            }
            (bool valid, bool outcome) = _parseYesNo(result);

            if (!valid) {
                // Same parseRequestedAt cleanup as the over-long branch above.
                market.status = MarketStatus.Open;
                market.parseRequestId = 0;
                market.parseRequestedAt = 0;
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
            // Non-success path (status was Failed, etc.). Same parseRequestedAt
            // cleanup as the success-but-invalid branches above.
            market.status = MarketStatus.Open;
            market.parseRequestId = 0;
            market.parseRequestedAt = 0;
            market.inferenceRequestId = 0;
            market.inferenceRequestedAt = 0;
            emit ResolutionFailed(marketId, requestId, RequestStage.Inference, status);
        }

        // v16 (M1): clear the request-id book-keeping on the success path.
        // The marketParseResult cleanup above is unconditional (v19 H1); the
        // requestToMarket / requestStage cleanup was already at the bottom
        // in v16 and remains so for the success branch. The overlong + invalid
        // branches `return` before reaching this line, having done their own
        // delete above.
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
        // v16 (L1): clear generationRequestedAt on every handleGenerationCallback exit.
        // v15 added the parseRequestedAt cleanup invariant for the resolution
        // callbacks (so an Open market isn't indistinguishable from one mid-parse);
        // the generation callback had the same shape but v1-v15 left the timestamp
        // set. This is invariant-cleanup only — the value is unused after the
        // callback returns, but getAgentMarketContext readers that walk the
        // generationProposer/state mapping no longer see stale timestamps on
        // requestIds that have already been processed.
        delete generationRequestedAt[requestId];

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

        bytes memory callData;
        uint256 createCallCount;
        for (uint256 i = 0; i < pendingToolCalls.length; i++) {
            if (
                pendingToolCalls[i].length >= 4 &&
                bytes4(_slice4(pendingToolCalls[i], 0)) == CREATE_MARKET_SELECTOR
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
        // v18 (H2): v16 added MAX_DURATION=86400 which reverts with
        // DurationTooLong() when the agent picks a duration above the cap.
        // The v17 decoder didn't have a case for it, so the receipt showed
        // a generic "create-reverted" reason. The inference agent is the
        // primary consumer of GenerationFailed.reason and needs the
        // descriptive string to debug.
        if (sel == bytes4(keccak256("DurationTooLong()"))) return "DurationTooLong";
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

    /// @dev v15: external agents can read the exact prompt template the
    /// contract sends to the LLM Inference agent's inferToolsChat, so they
    /// can predict the agent's tool-call output without having to decompile
    /// the source. Returns (prefix, suffix) — the contract concatenates
    /// "<prefix><topic><suffix>" as the single user message.
    function getGenerationPromptTemplate() external pure returns (string memory prefix, string memory suffix) {
        return (GENERATION_PROMPT_PREFIX, GENERATION_PROMPT_SUFFIX);
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

    // v40 (L0): enumerate the markets a user has bet on, in the order they
    // were first bet on (push order into userMarketIds[user]). The My Bets
    // tab uses this to replace an O(N) "load every market page and check
    // each for a position" with an O(K) "load the user's markets and check
    // only those". After a claim, the position amounts (userYesBets /
    // userNoBets) are zeroed but the market id stays in the array — the
    // frontend reads the amounts to distinguish "active position" from
    // "history".
    function getUserMarkets(address user) external view returns (uint256[] memory) {
        return userMarketIds[user];
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
            inferenceRequestedAt: market.inferenceRequestedAt,
            parseResultCached: bytes(marketParseResult[marketId]).length > 0
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
            "AutoResolve agent interface v40. ",
            "RESOLUTION PIPELINE: scanResolvableMarkets(cursor, limit) to discover expired open markets (returns (uint256[] ids, uint256 nextCursor), max limit 50). ",
            "getAgentMarketContext(marketId) for question, source, funding, request IDs, and per-request timestamps (parseRequestedAt, inferenceRequestedAt - both 0 when no request is in flight, including for Open markets in the inference-rollback window). ",
            "requestResolution(marketId) payable returns (uint256 requestId); the call is gated on market.status==Open, endTime passed, parseRequestId==0; requires topUpNeeded STT. ",
            "On success the parse request is created; the platform calls back asynchronously. ",
            "If parse succeeds but the contract is underfunded for the inference call, the market rolls back to Open, the parse result is cached in marketParseResult[marketId], and InferenceUnderfunded(uint256 indexed marketId, uint256 indexed parseRequestId, string parseResult) is emitted. The relayer watches this event and calls retryInferenceFromCache(marketId) payable to skip the re-parse. ",
            "retryInferenceFromCache requires market.status==Open, endTime passed, no parse/inference request in flight, non-empty cache, and balance >= getInferenceDeposit(); the cache is consumed on success. ",
            "Inference output must be exactly YES (3 bytes) or NO (2 bytes); anything else (YEAH, NOPE, MAYBE, whitespace) reopens the market. v13 had a parser bug that silently rejected every NO outcome by matching NOO instead of NO; v14 fixes it. v15 fixes a separate state-cleanup bug where the inference-rollback branches left parseRequestedAt set to the original parse timestamp, misleading getAgentMarketContext readers. v19 (H1) extends the v15/v16/v17/v18 symmetric-cleanup invariant to ALL four exit branches of handleInferenceCallback (overlong, invalid, non-success, success+YES) by hoisting the delete marketParseResult[marketId] to the top of the function. The pre-v19 code returned from the overlong + invalid branches before reaching the v16 M1 bottom-of-function delete, so a future retryInferenceFromCache on a reopened market could have hit InferenceNotCached with a stale cache string. ",
            "STUCK-MARKET RECOVERY: scanStuckMarkets(cursor, limit) lists markets stuck in Resolving whose parse or inference request is older than STALE_REQUEST_TIMEOUT (30 minutes); forceResetMarket(marketId) reverts such a market back to Open so the relayer can re-trigger resolution. ",
            "forceResetMarket emits MarketReset(uint256 indexed marketId, address indexed resetBy, RequestStage stage, uint256 stuckRequestId) so external agents tracking platform request ids can correlate the reset with their own bookkeeping; the bundled relayer keys its own retry state by marketId and does not consume stuckRequestId. ",
            "STUCK-GENERATION RECOVERY: scanStuckGenerationRequests(cursor, limit) lists in-flight generation requests older than STALE_REQUEST_TIMEOUT (30 minutes); forceResetGeneration(requestId) clears the requestToTopic, generationProposer, requestStage, and generationRequestedAt mappings so the user's inference deposit is the only lost value (the deposit was forwarded to the platform at request time and is not refundable). v16 also clears generationRequestedAt on every successful handleGenerationCallback exit, matching the v15 parseRequestedAt cleanup invariant. ",
            "forceResetGeneration emits GenerationReset(uint256 indexed requestId, address indexed resetBy). ",
            "USER POSITION DISCOVERY (v40): getUserMarkets(address user) returns (uint256[]) -- enumerates the markets the user has bet on, in the order they were first bet on. Replaces the O(N) 'load every market and check' pattern with a single targeted read. bet() pushes (msg.sender, marketId) into a per-user set on first bet; claimWinnings does NOT remove the entry -- the array tracks 'user has bet on this market at some point' and frontends read userYesBets/userNoBets (which are zeroed on claim) to distinguish active positions from history. ",
            "CREATION PIPELINE: requestMarketGeneration(string topic) payable returns (uint256 requestId); triggers LLM Inference inferToolsChat that yields createMarket(question, source, durationSeconds) calldata. ",
            "getGenerationFundingStatus() returns the inference deposit and topUpNeeded. ",
            "getGenerationPromptTemplate() returns (string prefix, string suffix); the contract concatenates prefix + topic + suffix as the single user message - external agents can read this to predict the agent's tool-call output without decompiling. ",
            "scanAgentCreatedMarkets(cursor, limit) lists markets whose creator == AGENT_CREATOR_SENTINEL (0xA1). ",
            "If the agent returns multiple createMarket tool calls in one response, the contract executes the first and emits DuplicateToolCall(requestId, count) as a non-fatal advisory; the rest are discarded. ",
            "OUTPUT CAPS: agent responses (parse result, inference result) are capped at MAX_AGENT_OUTPUT_LENGTH (1024 bytes). Over-long responses are treated as a parse/inference failure - the market reopens and ResolutionFailed is emitted. The contract never reverts in callbacks. ",
            "CONSTRAINTS: question <= 500 chars, source is an http(s) URL (case-insensitive scheme, leading whitespace allowed) pointing at a SPECIFIC article or page (not a site homepage), duration in [300, 86400] seconds (MAX_DURATION upper bound added in v16 - v1-v15 only enforced the lower bound), bet >= MIN_BET (0.001 STT), topic <= 200 chars. ",
            "CACHE INVARIANT (v17): marketParseResult[marketId] is cleared on every requestResolution entry (preventing stale-cache races on underfunded-then-re-requested markets), on every forceResetMarket, on the parse-failure branch of handleAgentResponse, on the overlong-output branch of handleAgentResponse (v18 M1), and (v19 H1) unconditionally on every handleInferenceCallback exit (hoisted to the top of the function). The public getter marketParseResult(uint256 marketId) returns the full cached string for agents that want the raw scrape without going through the context struct; the empty string means no cache. getAgentMarketContext exposes a parseResultCached bool so external agents can decide whether to call retryInferenceFromCache from a single read. ",
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
        // v17 (H1): clear any stale parse-result cache. v16 missed this site
        // in its symmetric-cleanup audit — a force-reset followed by a fresh
        // resolve attempt and a parse failure would leave the cache pointing
        // at the old scrape, letting retryInferenceFromCache skip the parse.
        delete marketParseResult[marketId];

        emit MarketReset(marketId, msg.sender, stage, stuckRequestId);
    }
}
