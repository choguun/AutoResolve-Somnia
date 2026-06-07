// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AutonomousPredictionMarket} from "../src/AutonomousPredictionMarket.sol";
import {Response, ResponseStatus, Request} from "../src/interfaces/IAgentRequester.sol";

contract MockAgentPlatform {
    uint256 public requestDeposit = 0.01 ether;
    uint256 public nextRequestId = 1;
    uint256 public lastAgentId;
    address public lastCallbackAddress;
    bytes4 public lastCallbackSelector;
    bytes public lastPayload;
    uint256 public lastValue;

    function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload)
        external
        payable
        returns (uint256 requestId)
    {
        if (nextRequestId == 0) {
            nextRequestId = 1;
        }
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackAddress = callbackAddress;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
        lastValue = msg.value;
    }

    function getRequestDeposit() external view returns (uint256) {
        return requestDeposit;
    }

    function setRequestDeposit(uint256 deposit) external {
        requestDeposit = deposit;
    }
}

contract ReentrantClaimer {
    AutonomousPredictionMarket public market;
    uint256 public marketId;
    bool public attacking;
    bool public attackFailed;

    constructor(AutonomousPredictionMarket _market) {
        market = _market;
    }

    function arm(uint256 _marketId) external {
        marketId = _marketId;
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            try market.claimWinnings(marketId) {} catch {
                attackFailed = true;
            }
        }
    }

    function attack() external {
        attacking = true;
        market.claimWinnings(marketId);
    }
}

contract MarketHarness is AutonomousPredictionMarket {
    function forceResolve(uint256 marketId, bool outcome) external {
        markets[marketId].status = MarketStatus.Resolved;
        markets[marketId].outcome = outcome;
        markets[marketId].resolvedAt = block.timestamp;
    }

    function seedUserYesBet(address user, uint256 marketId, uint256 amount) external {
        markets[marketId].yesTotal += amount;
        userYesBets[user][marketId] = amount;
    }
}

contract AutonomousPredictionMarketTest is Test {
    address constant PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;

    MarketHarness market;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address resolver = makeAddr("resolver");

    function setUp() public {
        MockAgentPlatform mock = new MockAgentPlatform();
        vm.etch(PLATFORM, address(mock).code);
        MockAgentPlatform(PLATFORM).setRequestDeposit(0.01 ether);

        market = new MarketHarness();
    }

    function _createEndedMarket() internal returns (uint256 marketId) {
        marketId = market.createMarket("Is the capital of France Paris?", "https://en.wikipedia.org/wiki/Paris", 300);
        vm.warp(block.timestamp + 301);
    }

    function _successfulResponse(string memory result) internal view returns (Response[] memory responses) {
        responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xBEEF),
            result: abi.encode(result),
            status: ResponseStatus.Success,
            receipt: 123,
            timestamp: block.timestamp,
            executionCost: 0
        });
    }

    function _emptyRequest() internal pure returns (Request memory request) {}

    function testCreateMarketRejectsEmptyQuestion() public {
        vm.expectRevert(AutonomousPredictionMarket.QuestionEmpty.selector);
        market.createMarket("", "https://example.com", 300);
    }

    function testCreateMarketRejectsEmptySource() public {
        vm.expectRevert(AutonomousPredictionMarket.SourceEmpty.selector);
        market.createMarket("Will it rain?", "", 300);
    }

    function testCreateMarketRejectsShortDuration() public {
        vm.expectRevert(AutonomousPredictionMarket.DurationTooShort.selector);
        market.createMarket("Will it rain?", "https://example.com", 60);
    }

    // v16 (H2): MAX_DURATION upper bound. v1-v15 only enforced MIN_DURATION,
    // so a creator could mint a market with endTime decades in the future —
    // requestResolution is gated on block.timestamp >= endTime, so the
    // market would be permanently unresolvable. The relayer's forceResetMarket
    // only operates on Resolving markets, so it can't recover a fresh Open
    // market that was just minted with a huge duration.
    function testCreateMarketRejectsOverlongDuration() public {
        uint256 maxDuration = market.MAX_DURATION();
        vm.expectRevert(AutonomousPredictionMarket.DurationTooLong.selector);
        market.createMarket("Will it rain?", "https://example.com", maxDuration + 1);
    }

    function testCreateMarketAcceptsMaxDurationBoundary() public {
        // Boundary: exactly MAX_DURATION must succeed. Off-by-one in the
        // comparison would lock the upper end of the market space.
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", market.MAX_DURATION());
        assertEq(marketId, 1, "first market id");
    }

    function testCreateMarketRejectsOverlongQuestion() public {
        bytes memory longQuestion = new bytes(market.MAX_QUESTION_LENGTH() + 1);
        for (uint256 i = 0; i < longQuestion.length; i++) {
            longQuestion[i] = "a";
        }

        vm.expectRevert(AutonomousPredictionMarket.QuestionTooLong.selector);
        market.createMarket(string(longQuestion), "https://example.com", 300);
    }

    function testCreateMarketRejectsNonHttpUrl() public {
        vm.expectRevert(AutonomousPredictionMarket.InvalidSourceUrl.selector);
        market.createMarket("Will it rain?", "ftp://example.com/wiki/Paris", 300);
        vm.expectRevert(AutonomousPredictionMarket.InvalidSourceUrl.selector);
        market.createMarket("Will it rain?", "example.com/wiki/Paris", 300);
        vm.expectRevert(AutonomousPredictionMarket.InvalidSourceUrl.selector);
        market.createMarket("Will it rain?", "javascript:alert(1)", 300);
    }

    function testCreateMarketAcceptsHttpAndHttps() public {
        market.createMarket("Will it rain?", "http://example.com/wiki/Paris", 300);
        market.createMarket("Will it rain?", "https://example.com/wiki/Paris", 300);
        assertEq(market.nextMarketId(), 3, "two markets created");
    }

    function testCreateMarketAcceptsCaseInsensitiveSchemeAndWhitespace() public {
        // Uppercase scheme (RFC 3986 says scheme is case-insensitive).
        market.createMarket("Q?", "HTTPS://example.com/wiki/Paris", 300);
        // Leading whitespace from a copy-paste.
        market.createMarket("Q?", "   https://example.com/wiki/Paris", 300);
        // Trailing whitespace should also be tolerated.
        market.createMarket("Q?", "https://example.com/wiki/Paris   ", 300);
        // http (not https).
        market.createMarket("Q?", "HTTP://example.com/wiki/Paris", 300);
        assertEq(market.nextMarketId(), 5, "four markets created");
    }

    function testBetUpdatesTotals() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.bet{value: 0.3 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        market.bet{value: 0.2 ether}(marketId, AutonomousPredictionMarket.BetOption.No);

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.yesTotal, 0.3 ether);
        assertEq(m.noTotal, 0.2 ether);
        assertEq(market.userYesBets(alice, marketId), 0.3 ether);
        assertEq(market.userNoBets(bob, marketId), 0.2 ether);
    }

    function testBetRejectsBelowMinimum() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        vm.expectRevert(AutonomousPredictionMarket.BetBelowMinimum.selector);
        market.bet{value: 0}(marketId, AutonomousPredictionMarket.BetOption.Yes);
        vm.expectRevert(AutonomousPredictionMarket.BetBelowMinimum.selector);
        market.bet{value: 0.0001 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);
    }

    function testBetRejectsAfterEndTime() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        vm.deal(alice, 1 ether);
        vm.warp(block.timestamp + 600);
        vm.prank(alice);
        vm.expectRevert(AutonomousPredictionMarket.MarketEnded.selector);
        market.bet{value: 0.1 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);
    }

    function testClaimWinningsPaysOnlyWinningYesBettors() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);

        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);

        vm.prank(alice);
        market.bet{value: 0.6 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);

        vm.prank(bob);
        market.bet{value: 0.4 ether}(marketId, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(marketId, true);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claimWinnings(marketId);

        assertEq(alice.balance - aliceBefore, 1 ether);

        vm.prank(bob);
        vm.expectRevert(AutonomousPredictionMarket.NoWinningBets.selector);
        market.claimWinnings(marketId);
    }

    function testClaimWinningsPaysOnlyWinningNoBettors() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);

        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);

        vm.prank(alice);
        market.bet{value: 0.6 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);

        vm.prank(bob);
        market.bet{value: 0.4 ether}(marketId, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(marketId, false);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);

        assertEq(bob.balance - bobBefore, 1 ether);
    }

    function testMissingMarketsCannotReceiveBetsResolutionOrClaims() public {
        vm.expectRevert(AutonomousPredictionMarket.MarketNotFound.selector);
        market.bet{value: 0.1 ether}(404, AutonomousPredictionMarket.BetOption.Yes);

        vm.expectRevert(AutonomousPredictionMarket.MarketNotFound.selector);
        market.requestResolution(404);

        vm.expectRevert(AutonomousPredictionMarket.MarketNotFound.selector);
        market.claimWinnings(404);
    }

    function testRequestResolutionRevertsBeforeEndTime() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        uint256 totalDeposit = market.getRequiredDeposit();
        vm.deal(resolver, totalDeposit + 1 ether);
        vm.prank(resolver);
        vm.expectRevert(AutonomousPredictionMarket.MarketStillActive.selector);
        market.requestResolution{value: totalDeposit}(marketId);
    }

    function testRequestResolutionRevertsOnAlreadyRequested() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        vm.expectRevert(AutonomousPredictionMarket.MarketNotOpen.selector);
        market.requestResolution{value: totalDeposit}(marketId);
    }

    function testRequestResolutionRevertsWhenContractUnderfunded() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, 0.01 ether);
        vm.prank(resolver);
        vm.expectRevert(AutonomousPredictionMarket.InsufficientContractBalance.selector);
        market.requestResolution{value: 0.01 ether}(marketId);
    }

    function testRequestResolutionKeepsOnlyNeededTopUpForInference() public {
        uint256 marketId = _createEndedMarket();
        uint256 parseDeposit = market.getParseDeposit();
        uint256 inferDeposit = market.getInferenceDeposit();
        uint256 totalDeposit = parseDeposit + inferDeposit;

        vm.deal(resolver, totalDeposit + 0.2 ether);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit + 0.2 ether}(marketId);

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Resolving));
        assertEq(m.parseRequestId, 1);
        assertEq(address(market).balance, inferDeposit);
        assertEq(resolver.balance, 0.2 ether);
        assertEq(PLATFORM.balance, parseDeposit);
    }

    function testRequestResolutionRefundsFullValueWhenContractAlreadyFunded() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        (bool ok,) = address(market).call{value: totalDeposit}("");
        assertTrue(ok);

        vm.deal(resolver, 0.1 ether);
        vm.prank(resolver);
        market.requestResolution{value: 0.1 ether}(marketId);

        assertEq(resolver.balance, 0.1 ether);
    }

    function testFundingStatusReportsAgentTopUpNeed() public {
        uint256 requiredDeposit = market.getRequiredDeposit();

        (uint256 required, uint256 balance, uint256 topUpNeeded) = market.getResolutionFundingStatus();
        assertEq(required, requiredDeposit);
        assertEq(balance, 0);
        assertEq(topUpNeeded, requiredDeposit);

        (bool ok,) = address(market).call{value: 0.2 ether}("");
        assertTrue(ok);

        (required, balance, topUpNeeded) = market.getResolutionFundingStatus();
        assertEq(required, requiredDeposit);
        assertEq(balance, 0.2 ether);
        assertEq(topUpNeeded, requiredDeposit - 0.2 ether);
    }

    function testAgentContextAndScanExposeResolvableMarkets() public {
        uint256 resolvableMarket = _createEndedMarket();
        uint256 activeMarket = market.createMarket("Will it rain tomorrow?", "https://example.com/weather", 300);

        AutonomousPredictionMarket.AgentMarketContext memory context = market.getAgentMarketContext(resolvableMarket);
        assertTrue(context.exists);
        assertTrue(context.canResolve);
        assertEq(context.marketId, resolvableMarket);
        assertEq(context.question, "Is the capital of France Paris?");
        assertEq(context.resolutionSource, "https://en.wikipedia.org/wiki/Paris");
        assertEq(context.totalPool, 0);
        assertEq(context.requiredDeposit, market.getRequiredDeposit());
        // v14: AgentMarketContext now exposes the in-flight request timestamps so
        // external operators can compute staleness without re-reading storage.
        assertEq(context.parseRequestedAt, 0, "no parse request yet");
        assertEq(context.inferenceRequestedAt, 0, "no inference request yet");

        context = market.getAgentMarketContext(activeMarket);
        assertTrue(context.exists);
        assertFalse(context.canResolve);

        (uint256[] memory ids, uint256 nextCursor) = market.scanResolvableMarkets(1, 10);
        assertEq(ids.length, 1);
        assertEq(ids[0], resolvableMarket);
        assertEq(nextCursor, market.nextMarketId());

        // After requesting resolution, parseRequestedAt should be populated and
        // inferenceRequestedAt should remain zero until the parse callback fires.
        uint256 totalDeposit = market.getRequiredDeposit();
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(resolvableMarket);

        context = market.getAgentMarketContext(resolvableMarket);
        assertEq(context.parseRequestedAt, block.timestamp, "parse request timestamp tracked");
        assertEq(context.inferenceRequestedAt, 0, "inference not yet started");

        // After the parse callback advances the pipeline, the inference timestamp
        // should be populated and the parse timestamp should reset to zero.
        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        context = market.getAgentMarketContext(resolvableMarket);
        assertEq(context.parseRequestedAt, 0, "parse request timestamp cleared");
        assertEq(context.inferenceRequestedAt, block.timestamp, "inference request timestamp tracked");
    }

    function testScanResolvableMarketsRejectsInvalidLimit() public {
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanResolvableMarkets(1, 0);

        uint256 invalidLimit = market.MAX_AGENT_SCAN_LIMIT() + 1;
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanResolvableMarkets(1, invalidLimit);
    }

    function testParseCallbackSuccessStartsInferenceAndCleansParseRequest() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Resolving));
        assertEq(m.parseRequestId, 1);
        assertEq(m.inferenceRequestId, 2);
        assertEq(market.requestToMarket(1), 0);
        assertEq(uint256(market.requestStage(1)), uint256(AutonomousPredictionMarket.RequestStage.None));
        assertEq(market.requestToMarket(2), marketId);
        assertEq(uint256(market.requestStage(2)), uint256(AutonomousPredictionMarket.RequestStage.Inference));
    }

    function testParseCallbackSuccessWithInsufficientInferenceBalanceReopens() public {
        // Contract has the full resolution deposit at requestResolution time,
        // but the parse callback arrives after another callback has drained
        // the contract below the inference deposit. _resolveWithLLMInference
        // must roll the market back to Open and emit ResolutionFailed so the
        // relayer can retry once the contract is refilled.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Drain the contract below the inference deposit. getInferenceDeposit()
        // is 0.31 STT — leave only 0.1 STT so the inference call can't pay.
        uint256 inferenceDeposit = market.getInferenceDeposit();
        vm.deal(address(market), 0.1 ether);
        assertLt(address(market).balance, inferenceDeposit, "contract underfunded for inference");

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.inferenceRequestId, 0, "no inference request made");
        // The parse request slot is also cleared so a relayer can re-resolve.
        assertEq(market.requestToMarket(1), 0, "requestToMarket cleared");
        assertEq(uint256(market.requestStage(1)), uint256(AutonomousPredictionMarket.RequestStage.None), "requestStage cleared");
    }

    function testParseCallbackFailureReopensMarket() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        Response[] memory responses = new Response[](0);
        vm.prank(PLATFORM);
        market.handleAgentResponse(1, responses, ResponseStatus.Failed, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open));
        assertEq(m.parseRequestId, 0);
        assertEq(market.requestToMarket(1), 0);
        assertEq(uint256(market.requestStage(1)), uint256(AutonomousPredictionMarket.RequestStage.None));
    }

    function testParseFailureOnHomepageUrlReopensMarket() public {
        // v7 prompt requires SPECIFIC article URLs because the parse agent returns
        // HTTP 422 on homepages. Simulate the agent's parse failure on a homepage
        // URL and assert the market reopens cleanly for a retry.
        uint256 marketId = market.createMarket(
            "Did Bitcoin reach 100k USD in 2024?", "https://bitcoin.org/", 300
        );
        vm.warp(block.timestamp + 600);
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Simulate the agent returning failure (e.g. HTTP 422 on homepage).
        Response[] memory responses = new Response[](0);
        vm.prank(PLATFORM);
        market.handleAgentResponse(1, responses, ResponseStatus.Failed, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");

        // A second requestResolution call should now succeed (the re-relay path).
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        assertEq(uint256(market.getMarket(marketId).status), uint256(AutonomousPredictionMarket.MarketStatus.Resolving));
    }

    function testParseCallbackRevertsWhileStillPending() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.StillPending.selector);
        market.handleAgentResponse(1, _successfulResponse("X"), ResponseStatus.Pending, _emptyRequest());
    }

    function testInferenceCallbackRevertsWhileStillPending() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        uint256 inferenceId = m.inferenceRequestId;
        assertGt(inferenceId, 0, "parse callback created inference request");

        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.StillPending.selector);
        market.handleInferenceCallback(inferenceId, _successfulResponse("YES"), ResponseStatus.Pending, _emptyRequest());
    }

    function testInferenceCallbackRevertsOnNoneStatus() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        uint256 inferenceId = m.inferenceRequestId;
        assertGt(inferenceId, 0, "parse callback created inference request");

        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.StillPending.selector);
        market.handleInferenceCallback(inferenceId, _successfulResponse("YES"), ResponseStatus.None, _emptyRequest());
    }

    function testInferenceCallbackSuccessResolvesMarket() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        vm.prank(PLATFORM);
        market.handleInferenceCallback(2, _successfulResponse("YES"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Resolved));
        assertTrue(m.outcome);
        assertEq(m.resolutionReason, "YES");
        assertGt(m.resolvedAt, 0);
        assertEq(market.requestToMarket(2), 0);
        assertEq(uint256(market.requestStage(2)), uint256(AutonomousPredictionMarket.RequestStage.None));
    }

    function testInferenceCallbackResolvesNoOutcome() public {
        // Regression test for v13's silent NO bug: _parseYesNo gated the NO branch
        // on resultBytes.length == 3 and checked resultBytes[2] == "O", matching
        // "NOO" rather than "NO". Every NO outcome was rejected as invalid and
        // the market reopened forever. v14 splits the length check (3 for YES,
        // 2 for NO) and accepts the 2-byte NO that the platform's constrained
        // classifier actually returns.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("The capital is Berlin, not Paris."), ResponseStatus.Success, _emptyRequest()
        );

        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;
        assertGt(inferenceId, 0, "parse callback created inference request");

        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse("NO"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(
            uint256(m.status),
            uint256(AutonomousPredictionMarket.MarketStatus.Resolved),
            "NO outcome must resolve the market"
        );
        assertFalse(m.outcome, "outcome must be NO (false)");
        assertEq(m.resolutionReason, "NO", "reason must be the raw NO literal");
        assertGt(m.resolvedAt, 0, "resolvedAt set");
        assertEq(market.requestToMarket(inferenceId), 0, "requestToMarket cleared");
        assertEq(
            uint256(market.requestStage(inferenceId)),
            uint256(AutonomousPredictionMarket.RequestStage.None),
            "requestStage cleared"
        );
    }

    function testInferenceCallbackRejectsNooLiteral() public {
        // Defensive: the v13 bug accepted "NOO" as a (false) NO outcome.
        // v14 must treat "NOO" (length 3, third byte O) as invalid and reopen.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());

        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse("NOO"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(
            uint256(m.status),
            uint256(AutonomousPredictionMarket.MarketStatus.Open),
            "NOO must reopen the market"
        );
        assertFalse(m.outcome, "outcome stays default false");
    }

    function testInferenceCallbackFailureReopensMarket() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence text"), ResponseStatus.Success, _emptyRequest());

        Response[] memory responses = new Response[](0);
        vm.prank(PLATFORM);
        market.handleInferenceCallback(2, responses, ResponseStatus.Failed, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open));
        assertEq(m.parseRequestId, 0);
        assertEq(m.inferenceRequestId, 0);
    }

    function testInferenceCallbackInvalidOutputReopensMarket() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence text"), ResponseStatus.Success, _emptyRequest());

        vm.prank(PLATFORM);
        market.handleInferenceCallback(2, _successfulResponse("MAYBE"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open));
        assertEq(m.parseRequestId, 0);
        assertEq(m.inferenceRequestId, 0);
        assertFalse(m.outcome);
        assertEq(bytes(m.resolutionReason).length, 0);
    }

    function testInferenceCallbackRejectsLooseYesNo() public {
        // The tightened _parseYesNo only accepts the exact strings "YES" / "NO"
        // (3 ASCII chars). Anything that merely starts with Y/y/N/n is rejected.
        // "YEAH" (4 chars starting with Y) and "NOPE" (4 chars starting with N)
        // both used to be silently accepted; now they must reopen the market.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Read the inference requestId from the market state (the mock platform
        // increments its counter globally, so we can't hardcode id 2 here).
        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;
        assertGt(inferenceId, 0, "parse callback created inference request");

        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse("YEAH"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "YEAH reopens market");
        assertFalse(m.outcome, "outcome stays false for YEAH");
    }

    function testUnauthorizedCallbacksRevert() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.expectRevert(AutonomousPredictionMarket.OnlyPlatform.selector);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());

        vm.expectRevert(AutonomousPredictionMarket.OnlyPlatform.selector);
        market.handleInferenceCallback(1, _successfulResponse("YES"), ResponseStatus.Success, _emptyRequest());
    }

    function testCallbackStageMismatchReverts() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.InvalidStage.selector);
        market.handleInferenceCallback(1, _successfulResponse("YES"), ResponseStatus.Success, _emptyRequest());
    }

    function testUnknownRequestReverts() public {
        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.UnknownRequest.selector);
        market.handleAgentResponse(999, _successfulResponse("X"), ResponseStatus.Success, _emptyRequest());
    }

    function testWinnerCannotClaimTwice() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);

        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);

        vm.prank(alice);
        market.bet{value: 0.6 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);

        vm.prank(bob);
        market.bet{value: 0.4 ether}(marketId, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(marketId, true);

        vm.startPrank(alice);
        market.claimWinnings(marketId);
        vm.expectRevert(AutonomousPredictionMarket.NoWinningBets.selector);
        market.claimWinnings(marketId);
        vm.stopPrank();
    }

    function testClaimRevertsWhenMarketNotResolved() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.bet{value: 0.1 ether}(marketId, AutonomousPredictionMarket.BetOption.Yes);
        vm.expectRevert(AutonomousPredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(marketId);
    }

    function testReceiveEmitsRebateEvent() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(market).call{value: 0.05 ether}("");
        assertTrue(ok);
        assertEq(address(market).balance, 0.05 ether);
    }

    function testAgentManifestDescribesInterface() public {
        string memory manifest = market.agentManifest();
        assertGt(bytes(manifest).length, 50);
        assertTrue(_contains(manifest, "scanResolvableMarkets"));
        assertTrue(_contains(manifest, "getAgentMarketContext"));
        assertTrue(_contains(manifest, "requestResolution"));
    }

    function testAgentManifestAdvertisesV14() public {
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v14"), "manifest should advertise v14");
        assertTrue(_contains(manifest, "inferToolsChat"), "manifest should mention inferToolsChat");
        assertTrue(_contains(manifest, "SPECIFIC"), "manifest should mention SPECIFIC-URL requirement");
        assertTrue(_contains(manifest, "MIN_BET"), "manifest should mention MIN_BET");
        assertTrue(_contains(manifest, "YES"), "manifest should mention YES/NO output format");
        assertTrue(_contains(manifest, "scanStuckMarkets"), "manifest should advertise stuck-market recovery");
        assertTrue(_contains(manifest, "forceResetMarket"), "manifest should advertise forceResetMarket");
        // v13 surface still advertised
        assertTrue(_contains(manifest, "scanStuckGenerationRequests"), "manifest should advertise stuck-generation recovery");
        assertTrue(_contains(manifest, "forceResetGeneration"), "manifest should advertise forceResetGeneration");
        assertTrue(_contains(manifest, "MAX_AGENT_OUTPUT_LENGTH"), "manifest should advertise the output cap");
        // v14 additions
        assertTrue(
            _contains(manifest, "YES (3 bytes) or NO (2 bytes)"),
            "manifest should describe the corrected YES/NO length contract"
        );
        assertTrue(
            _contains(manifest, "DuplicateToolCall"),
            "manifest should advertise the duplicate-tool-call advisory"
        );
        assertTrue(
            _contains(manifest, "parseRequestedAt"),
            "manifest should mention the new per-request timestamp fields on AgentMarketContext"
        );
    }

    function testForceResetMarketRevertsWhenNotStuck() public {
        // A freshly-created market is not in Resolving at all, so NotStuck.
        uint256 marketId = _createEndedMarket();
        vm.expectRevert(AutonomousPredictionMarket.NotStuck.selector);
        market.forceResetMarket(marketId);
    }

    function testForceResetMarketRevertsWhenRequestIsFresh() public {
        // After requestResolution the market is in Resolving, but the parse
        // request is brand new — NotStuck because the timeout hasn't elapsed.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.expectRevert(AutonomousPredictionMarket.NotStuck.selector);
        market.forceResetMarket(marketId);
    }

    function testForceResetMarketRevertsWhenMarketNotFound() public {
        vm.expectRevert(AutonomousPredictionMarket.MarketNotFound.selector);
        market.forceResetMarket(999);
    }

    function testForceResetMarketRecoversStuckParseRequest() public {
        // The most important case: a parse request whose callback never
        // arrives (platform dropped it). After STALE_REQUEST_TIMEOUT, anyone
        // can call forceResetMarket, the market goes back to Open, and a
        // fresh requestResolution can pick it up.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Capture the parse request id and warp past the timeout.
        uint256 parseRequestId = market.getMarket(marketId).parseRequestId;
        assertGt(parseRequestId, 0, "parse request created");
        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT() + 1);

        vm.expectEmit(true, true, false, true, address(market));
        emit AutonomousPredictionMarket.MarketReset(
            marketId, address(this), AutonomousPredictionMarket.RequestStage.ParseWebsite, parseRequestId
        );
        market.forceResetMarket(marketId);

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "back to Open");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.inferenceRequestId, 0, "no inference request");
        assertEq(m.parseRequestedAt, 0, "parse timestamp cleared");
        assertEq(market.requestToMarket(parseRequestId), 0, "requestToMarket cleared");
        assertEq(
            uint256(market.requestStage(parseRequestId)),
            uint256(AutonomousPredictionMarket.RequestStage.None),
            "requestStage cleared"
        );

        // A fresh requestResolution now succeeds (the relayer's recovery path).
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        assertEq(
            uint256(market.getMarket(marketId).status),
            uint256(AutonomousPredictionMarket.MarketStatus.Resolving),
            "recovery path works"
        );
    }

    function testMarketResetEmitsStuckRequestId() public {
        // Decodes the MarketReset event from the receipt log to confirm the
        // stuckRequestId matches the parse request that was in flight. A
        // relayer that scans for MarketReset events uses this field to know
        // which platform request id to drop from any local retry bookkeeping.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        uint256 parseRequestId = market.getMarket(marketId).parseRequestId;
        assertGt(parseRequestId, 0, "parse request created");
        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT() + 1);

        vm.recordLogs();
        market.forceResetMarket(marketId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == keccak256("MarketReset(uint256,address,uint8,uint256)")
                && logs[i].emitter == address(market)
            ) {
                // The non-indexed args are packed after the topics.
                (uint256 emittedStuckRequestId) = abi.decode(logs[i].data, (uint256));
                assertEq(emittedStuckRequestId, parseRequestId, "stuckRequestId matches the in-flight parse request");
                found = true;
                break;
            }
        }
        assertTrue(found, "MarketReset event was emitted");
    }

    function testForceResetMarketRecoversStuckInferenceRequest() public {
        // Same as the parse-stuck test, but the parse callback ran successfully
        // and the inference callback is the one that never came back. This
        // exercises the Inference branch of _isStuck.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        // On the parse-callback success path, market.parseRequestId is left
        // pointing at the now-completed parse request (it is only cleared on
        // the failure path). inferenceRequestId is the new in-flight one.
        uint256 inferenceRequestId = market.getMarket(marketId).inferenceRequestId;
        assertGt(inferenceRequestId, 0, "inference request created");

        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT() + 1);

        vm.expectEmit(true, true, false, true, address(market));
        emit AutonomousPredictionMarket.MarketReset(
            marketId, address(this), AutonomousPredictionMarket.RequestStage.Inference, inferenceRequestId
        );
        market.forceResetMarket(marketId);

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open));
        assertEq(m.inferenceRequestId, 0);
        assertEq(m.parseRequestId, 0);
        assertEq(m.inferenceRequestedAt, 0);
        assertEq(market.requestToMarket(inferenceRequestId), 0);
    }

    function testScanStuckMarketsFindsAndExcludesFreshRequests() public {
        // Time-gap the two markets so their parseRequestedAt values are
        // distinct and the fresh one falls inside the timeout window.
        uint256 staleMarketId = _createEndedMarket(); // endTime already passed
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(staleMarketId);
        // Stale's parseRequestedAt = T1.

        // Create the fresh market and request resolution later, so the fresh
        // request's parseRequestedAt is T2 > T1.
        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT()); // 30 min later
        uint256 freshMarketId = market.createMarket("Will it rain?", "https://example.com", 300);
        vm.warp(block.timestamp + 301);

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(freshMarketId);
        // Fresh's parseRequestedAt = T1 + 1800 + 301.

        // Sanity: both in Resolving.
        assertEq(
            uint256(market.getMarket(staleMarketId).status),
            uint256(AutonomousPredictionMarket.MarketStatus.Resolving)
        );
        assertEq(
            uint256(market.getMarket(freshMarketId).status),
            uint256(AutonomousPredictionMarket.MarketStatus.Resolving)
        );

        // Warp forward by just over the timeout from T1. Stale is past the
        // window; fresh's parseRequestedAt is only 301s in the past, well
        // inside its 30-min window.
        vm.warp(block.timestamp + 1);

        (uint256[] memory ids, uint256 nextCursor) = market.scanStuckMarkets(0, 10);
        assertEq(ids.length, 1, "only the stale market is reported");
        assertEq(ids[0], staleMarketId, "stale market id matches");
        assertEq(nextCursor, market.nextMarketId(), "cursor advances to end");

        // forceResetMarket on the fresh one reverts NotStuck.
        vm.expectRevert(AutonomousPredictionMarket.NotStuck.selector);
        market.forceResetMarket(freshMarketId);
    }

    function testScanStuckMarketsPagination() public {
        // Limit must reject 0 and oversize.
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanStuckMarkets(0, 0);

        uint256 invalidLimit = market.MAX_AGENT_SCAN_LIMIT() + 1;
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanStuckMarkets(0, invalidLimit);
    }

    // -----------------------------------------------------------------------
    // v13: stuck-generation recovery + output length cap
    // -----------------------------------------------------------------------

    function testRequestMarketGenerationTracksLastGenerationRequestId() public {
        // Each successful requestMarketGeneration call must advance
        // lastGenerationRequestId so scanStuckGenerationRequests has a tight
        // upper bound (rather than walking the entire uint256 space).
        _fundContractForGeneration();
        assertEq(market.lastGenerationRequestId(), 0, "starts at 0");

        uint256 requestId1 = market.requestMarketGeneration("Topic one");
        assertEq(market.lastGenerationRequestId(), requestId1, "first id recorded");

        // Re-fund so the second call can also create a request.
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        vm.deal(address(this), requiredDeposit);
        (bool ok,) = address(market).call{value: requiredDeposit}("");
        assertTrue(ok, "refund for second call");

        uint256 requestId2 = market.requestMarketGeneration("Topic two");
        assertEq(market.lastGenerationRequestId(), requestId2, "second id recorded (monotonic)");
    }

    function testForceResetGenerationRevertsWhenNotStuck() public {
        // A fresh generation request is not stuck yet — the contract refuses
        // a force-reset until STALE_REQUEST_TIMEOUT has elapsed.
        _fundContractForGeneration();
        uint256 requestId = market.requestMarketGeneration("Some topic");

        vm.expectRevert(AutonomousPredictionMarket.GenerationNotStuck.selector);
        market.forceResetGeneration(requestId);
    }

    function testForceResetGenerationRevertsForUnknownRequest() public {
        // A request id that was never created (stage != GenerateMarket) is
        // _isGenerationStuck -> false, so forceResetGeneration reverts. This
        // also covers the case where the callback already ran and cleared the
        // stage — the relayer's scan won't see it again.
        vm.expectRevert(AutonomousPredictionMarket.GenerationNotStuck.selector);
        market.forceResetGeneration(999);
    }

    function testForceResetGenerationRecoversStuckRequest() public {
        // The symmetric case of testForceResetMarketRecoversStuckParseRequest:
        // a generation request whose callback never arrived (platform dropped
        // it). After STALE_REQUEST_TIMEOUT, anyone can call forceResetGeneration,
        // and all four state mappings are cleared so a fresh request can land.
        _fundContractForGeneration();
        uint256 requestId = market.requestMarketGeneration("Some topic");

        // Sanity: the four mappings were populated.
        assertEq(
            uint256(market.requestStage(requestId)),
            uint256(AutonomousPredictionMarket.RequestStage.GenerateMarket),
            "stage set"
        );
        assertEq(market.requestToTopic(requestId), "Some topic", "topic set");
        assertEq(market.generationProposer(requestId), address(this), "proposer set");
        assertGt(market.generationRequestedAt(requestId), 0, "timestamp set");

        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT() + 1);

        vm.expectEmit(true, true, false, false, address(market));
        emit AutonomousPredictionMarket.GenerationReset(requestId, address(this));
        market.forceResetGeneration(requestId);

        // All four mappings cleared.
        assertEq(
            uint256(market.requestStage(requestId)),
            uint256(AutonomousPredictionMarket.RequestStage.None),
            "stage cleared"
        );
        assertEq(bytes(market.requestToTopic(requestId)).length, 0, "topic cleared");
        assertEq(market.generationProposer(requestId), address(0), "proposer cleared");
        assertEq(market.generationRequestedAt(requestId), 0, "timestamp cleared");

        // lastGenerationRequestId is sticky on purpose (it's a high-water mark
        // for the scan's upper bound, not a state pointer). Confirm.
        assertEq(market.lastGenerationRequestId(), requestId, "high-water mark unchanged");
    }

    function testScanStuckGenerationRequestsFindsAndExcludesFresh() public {
        // Mirror of testScanStuckMarketsFindsAndExcludesFreshRequests: create
        // two generation requests time-gapped so the first is past the timeout
        // and the second is fresh. The scan must return only the stuck one.
        _fundContractForGeneration();
        uint256 staleRequestId = market.requestMarketGeneration("Stale topic");
        // staleRequestId's generationRequestedAt = T1.

        // Re-fund and time-warp forward so the fresh one has a later timestamp.
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        vm.deal(address(this), requiredDeposit);
        (bool ok,) = address(market).call{value: requiredDeposit}("");
        assertTrue(ok, "refund for second call");

        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT()); // 30 min later
        uint256 freshRequestId = market.requestMarketGeneration("Fresh topic");
        // freshRequestId's generationRequestedAt = T1 + 1800.

        // Sanity: both are at the GenerateMarket stage.
        assertEq(
            uint256(market.requestStage(staleRequestId)),
            uint256(AutonomousPredictionMarket.RequestStage.GenerateMarket)
        );
        assertEq(
            uint256(market.requestStage(freshRequestId)),
            uint256(AutonomousPredictionMarket.RequestStage.GenerateMarket)
        );

        // Warp forward by 1s. stale is now T1 + 1800 + 1s old, well past 30 min.
        // fresh is T1 + 1800, which is 1s old (still inside the 30-min window).
        vm.warp(block.timestamp + 1);

        (uint256[] memory ids, uint256 nextCursor) = market.scanStuckGenerationRequests(0, 10);
        assertEq(ids.length, 1, "only the stale request is reported");
        assertEq(ids[0], staleRequestId, "stale id matches");
        assertGt(nextCursor, 0, "cursor advanced");

        // forceResetGeneration on the fresh one reverts GenerationNotStuck.
        vm.expectRevert(AutonomousPredictionMarket.GenerationNotStuck.selector);
        market.forceResetGeneration(freshRequestId);
    }

    function testScanStuckGenerationRequestsPagination() public {
        // Limit must reject 0 and oversize.
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanStuckGenerationRequests(0, 0);

        uint256 invalidLimit = market.MAX_AGENT_SCAN_LIMIT() + 1;
        vm.expectRevert(AutonomousPredictionMarket.InvalidLimit.selector);
        market.scanStuckGenerationRequests(0, invalidLimit);
    }

    function testParseCallbackReopensMarketOnOverlongOutput() public {
        // A misbehaving agent returns a > MAX_AGENT_OUTPUT_LENGTH (1024) byte
        // string. The contract must treat this as a parse failure (reopen the
        // market, emit ResolutionFailed) rather than reverting, since a revert
        // would leave the market stuck in Resolving for STALE_REQUEST_TIMEOUT.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Build a 1025-byte response (one over the cap).
        bytes memory tooLong = new bytes(market.MAX_AGENT_OUTPUT_LENGTH() + 1);
        for (uint256 i = 0; i < tooLong.length; i++) tooLong[i] = "x";
        string memory longResult = string(tooLong);
        assertEq(bytes(longResult).length, market.MAX_AGENT_OUTPUT_LENGTH() + 1, "one over the cap");

        vm.recordLogs();
        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse(longResult), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.parseRequestedAt, 0, "parse timestamp cleared");
        assertEq(market.requestToMarket(1), 0, "requestToMarket cleared");
        assertEq(
            uint256(market.requestStage(1)),
            uint256(AutonomousPredictionMarket.RequestStage.None),
            "requestStage cleared"
        );

        // ResolutionFailed was emitted with stage=ParseWebsite.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ResolutionFailed(uint256,uint256,uint8,uint8)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            // topics[1] = marketId, topics[2] = requestId (both indexed).
            // data = (uint8 stage, uint8 status) - both padded to 32 bytes.
            uint256 loggedMarketId = uint256(logs[i].topics[1]);
            (uint8 loggedStage, uint8 loggedStatus) = abi.decode(logs[i].data, (uint8, uint8));
            if (
                loggedMarketId == marketId &&
                loggedStage == uint8(AutonomousPredictionMarket.RequestStage.ParseWebsite) &&
                loggedStatus == uint8(ResponseStatus.Failed)
            ) {
                found = true;
                break;
            }
        }
        assertTrue(found, "ResolutionFailed(stage=ParseWebsite) emitted");
    }

    // v18 (M1): The overlong-output branch in handleAgentResponse was missing
    // `delete marketParseResult[marketId]`. If a future `retryInferenceFromCache`
    // was called on the same market, the relayer would skip the re-parse using
    // a stale (or never-written) cache string, leading to a guaranteed
    // InferenceNotCached revert. The cache must be cleared symmetrically in
    // every branch that returns the market to Open, matching the v15/v17
    // parseRequestedAt + marketParseResult cleanup pattern.
    function testParseOverlongBranchClearsParseResultCache() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        bytes memory tooLong = new bytes(market.MAX_AGENT_OUTPUT_LENGTH() + 1);
        for (uint256 i = 0; i < tooLong.length; i++) tooLong[i] = "x";

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse(string(tooLong)), ResponseStatus.Success, _emptyRequest());

        // v18 invariant: the cache must be empty after any failure path that
        // returns the market to Open. An overlong parse output is one of
        // those paths — the v17 cleanup missed it.
        assertEq(bytes(market.marketParseResult(marketId)).length, 0, "marketParseResult cleared on overlong parse");
    }

    // v19 (H1): handleInferenceCallback's overlong-output and invalid-output
    // branches `return` before reaching the v16 M1 `delete marketParseResult`
    // at the bottom of the function. The same symmetric-cleanup invariant
    // that v18 M1 enforced for handleAgentResponse must hold here too —
    // otherwise a future retryInferenceFromCache on a reopened market would
    // hit a guaranteed InferenceNotCached revert. We pre-populate the cache
    // via vm.store at the known storage slot (marketParseResult is the
    // 13th declared state variable → slot 12; mapping value for marketId is
    // keccak256(abi.encode(marketId, 12))), then run the overlong callback
    // and assert the cache is empty.
    function testInferenceOverlongBranchClearsParseResultCache() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;
        assertGt(inferenceId, 0, "inference request created");

        // Pre-populate the parse-result cache at the mapping's storage slot.
        // marketParseResult sits at slot 14 in the contract's storage layout
        // (the _status uint256 from ReentrancyGuard takes slot 0; 14 vars
        // come before marketParseResult in the contract's declaration order —
        // v40 L0 added userMarketIds and _userMarketIndex, shifting the slot
        // from 12 to 14).
        bytes32 slot = keccak256(abi.encode(marketId, uint256(14)));
        // Encode "x" (length 1) inline: last byte = 1 * 2 = 0x02, byte 1 = 'x' = 0x78.
        bytes32 stored = bytes32(uint256(0x7800000000000000000000000000000000000000000000000000000000000002));
        vm.store(address(market), slot, stored);
        assertEq(bytes(market.marketParseResult(marketId)).length, 1, "cache pre-populated");

        bytes memory tooLong = new bytes(market.MAX_AGENT_OUTPUT_LENGTH() + 1);
        for (uint256 i = 0; i < tooLong.length; i++) tooLong[i] = "x";

        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse(string(tooLong)), ResponseStatus.Success, _emptyRequest());

        // v19 invariant: the overlong branch in handleInferenceCallback must
        // clear the cache. The pre-v19 code returned at line 717 before the
        // bottom-of-function delete at line 756, so a non-empty cache would
        // have survived.
        assertEq(bytes(market.marketParseResult(marketId)).length, 0, "marketParseResult cleared on overlong inference");
    }

    // v19 (H1): invalid-output branch (non-YES/NO result) in
    // handleInferenceCallback must also clear the cache. Same bug shape as
    // the overlong branch — both `return` before reaching the v16 M1
    // bottom-of-function delete.
    function testInferenceInvalidBranchClearsParseResultCache() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;

        // Pre-populate the cache. See slot comment in testInferenceOverlongBranch.
        bytes32 slot = keccak256(abi.encode(marketId, uint256(14)));
        bytes32 stored = bytes32(uint256(0x7800000000000000000000000000000000000000000000000000000000000002));
        vm.store(address(market), slot, stored);
        assertEq(bytes(market.marketParseResult(marketId)).length, 1, "cache pre-populated");

        // "MAYBE" is not YES/NO — triggers the invalid-output branch.
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse("MAYBE"), ResponseStatus.Success, _emptyRequest());

        assertEq(bytes(market.marketParseResult(marketId)).length, 0, "marketParseResult cleared on invalid inference");
    }

    // v19 (H1): Failed-status branch in handleInferenceCallback must also
    // clear the cache. Pre-v19, the v16 M1 bottom-of-function delete covered
    // this path, but the v19 hoist makes the invariant unconditional across
    // all four exit branches (success+YES, success+overlong, success+invalid,
    // non-success). Pinning the non-success path closes the loop on the
    // symmetric-cleanup test matrix.
    function testInferenceFailedStatusBranchClearsParseResultCache() public {
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;

        // Pre-populate the cache. See slot comment in testInferenceOverlongBranch.
        bytes32 slot = keccak256(abi.encode(marketId, uint256(14)));
        bytes32 stored = bytes32(uint256(0x7800000000000000000000000000000000000000000000000000000000000002));
        vm.store(address(market), slot, stored);
        assertEq(bytes(market.marketParseResult(marketId)).length, 1, "cache pre-populated");

        Response[] memory responses = new Response[](0);
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, responses, ResponseStatus.Failed, _emptyRequest());

        assertEq(bytes(market.marketParseResult(marketId)).length, 0, "marketParseResult cleared on failed inference");
    }

    function testInferenceCallbackReopensMarketOnOverlongOutput() public {
        // Same shape as the parse-overlong test but on the inference callback.
        // An over-long inference result must also be treated as a failure, not
        // a revert — a revert would leave the market stuck in Resolving.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest());

        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;
        assertGt(inferenceId, 0, "inference request created");

        bytes memory tooLong = new bytes(market.MAX_AGENT_OUTPUT_LENGTH() + 1);
        for (uint256 i = 0; i < tooLong.length; i++) tooLong[i] = "x";
        string memory longResult = string(tooLong);

        vm.recordLogs();
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse(longResult), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.inferenceRequestId, 0, "inference request cleared");
        assertFalse(m.outcome, "outcome stays false");
        assertEq(bytes(m.resolutionReason).length, 0, "reason stays empty");
        assertEq(market.requestToMarket(inferenceId), 0, "requestToMarket cleared");
        assertEq(
            uint256(market.requestStage(inferenceId)),
            uint256(AutonomousPredictionMarket.RequestStage.None),
            "requestStage cleared"
        );

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ResolutionFailed(uint256,uint256,uint8,uint8)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            uint256 loggedMarketId = uint256(logs[i].topics[1]);
            (uint8 loggedStage, uint8 loggedStatus) = abi.decode(logs[i].data, (uint8, uint8));
            if (
                loggedMarketId == marketId &&
                loggedStage == uint8(AutonomousPredictionMarket.RequestStage.Inference) &&
                loggedStatus == uint8(ResponseStatus.Failed)
            ) {
                found = true;
                break;
            }
        }
        assertTrue(found, "ResolutionFailed(stage=Inference) emitted");
    }

    function testInferenceCallbackOverlongPathClearsParseRequestedAt() public {
        // v15 H1 regression: the over-long-output branch in handleInferenceCallback
        // must clear parseRequestedAt along with the other Resolving state. Before
        // v15, this branch only cleared parseRequestId / inferenceRequestId and
        // their timestamps, leaving parseRequestedAt set to the original parse
        // timestamp. getAgentMarketContext readers then saw an Open market with
        // parseRequestedAt != 0, which was indistinguishable from a market
        // mid-parse.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;

        bytes memory tooLong = new bytes(market.MAX_AGENT_OUTPUT_LENGTH() + 1);
        for (uint256 i = 0; i < tooLong.length; i++) tooLong[i] = "x";
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse(string(tooLong)), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.parseRequestedAt, 0, "parse request timestamp cleared (v15 H1 fix)");
        assertEq(m.inferenceRequestId, 0, "inference request cleared");
        assertEq(m.inferenceRequestedAt, 0, "inference request timestamp cleared");
    }

    function testInferenceCallbackInvalidOutputPathClearsParseRequestedAt() public {
        // v15 H1 regression: the invalid-output branch (non-YES/NO result) in
        // handleInferenceCallback must also clear parseRequestedAt. Same bug
        // shape as the over-long branch — the failure path opened the market
        // back to Open but left the parse timestamp dangling.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;

        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, _successfulResponse("MAYBE"), ResponseStatus.Success, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.parseRequestedAt, 0, "parse request timestamp cleared (v15 H1 fix)");
        assertEq(m.inferenceRequestId, 0, "inference request cleared");
        assertEq(m.inferenceRequestedAt, 0, "inference request timestamp cleared");
    }

    function testInferenceCallbackFailedStatusPathClearsParseRequestedAt() public {
        // v15 H1 regression: the non-success-status branch in
        // handleInferenceCallback must also clear parseRequestedAt. The bug
        // shape is the same as the other two rollback branches — opening the
        // market back to Open without cleaning up the parse timestamp left
        // getAgentMarketContext readers thinking the market was mid-parse.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        vm.prank(PLATFORM);
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());
        uint256 inferenceId = market.getMarket(marketId).inferenceRequestId;

        Response[] memory responses = new Response[](0);
        vm.prank(PLATFORM);
        market.handleInferenceCallback(inferenceId, responses, ResponseStatus.Failed, _emptyRequest());

        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market reopens");
        assertEq(m.parseRequestId, 0, "parse request cleared");
        assertEq(m.parseRequestedAt, 0, "parse request timestamp cleared (v15 H1 fix)");
        assertEq(m.inferenceRequestId, 0, "inference request cleared");
        assertEq(m.inferenceRequestedAt, 0, "inference request timestamp cleared");
    }

    function testGenerationPromptTemplateGetterReturnsContractConstants() public {
        // v15 L1: external agents need a stable on-chain source for the exact
        // prompt prefix + suffix the contract sends to the LLM Inference
        // agent's inferToolsChat. They previously had to decompile the source
        // (or scrape this repo) to predict the agent's tool-call output.
        (string memory prefix, string memory suffix) = market.getGenerationPromptTemplate();

        assertEq(prefix, market.GENERATION_PROMPT_PREFIX(), "prefix matches the constant");
        assertEq(suffix, market.GENERATION_PROMPT_SUFFIX(), "suffix matches the constant");
        assertTrue(
            _contains(prefix, "Design a binary YES/NO prediction market"),
            "prefix explains the design task"
        );
        assertTrue(_contains(suffix, "createMarket(question, source, durationSeconds)"), "suffix names the tool");
        assertTrue(_contains(suffix, "SPECIFIC"), "suffix enforces the SPECIFIC-URL rule");
        assertTrue(_contains(suffix, "[300, 600]"), "suffix enforces the [300, 600] duration range");
    }

    function testAgentManifestAdvertisesV15() public {
        // v15 additions: the parseRequestedAt-rollback fix, the prompt-template
        // getter, and the version bump itself.
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v15") || _contains(manifest, "v16"), "manifest advertises v15+");
        assertTrue(_contains(manifest, "getGenerationPromptTemplate"), "manifest mentions the prompt-template getter");
        assertTrue(
            _contains(manifest, "parseRequestedAt") &&
                _contains(manifest, "inference-rollback"),
            "manifest documents the parseRequestedAt rollback fix"
        );
    }

    function testAgentManifestAdvertisesV16() public {
        // v16 additions: the MAX_DURATION upper bound, the retryInferenceFromCache
        // path with the InferenceUnderfunded event, and the version bump itself.
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v16"), "manifest advertises v16");
        assertTrue(_contains(manifest, "retryInferenceFromCache"), "manifest mentions retry-from-cache");
        assertTrue(_contains(manifest, "InferenceUnderfunded"), "manifest mentions the new event");
        assertTrue(_contains(manifest, "MAX_DURATION"), "manifest documents the upper bound");
    }

    // --- v17 hardening tests ---

    function testRequestResolutionClearsStaleCacheOnAlreadyRequested() public {
        // v17 (H1): a successful requestResolution that fails its parse
        // callback rolls the market back to Open WITH the cache populated
        // (so a relayer can call retryInferenceFromCache). v16 left the
        // cache populated in that state, and a fresh requestResolution
        // would either revert (parseRequestId != 0 → AlreadyRequested) or,
        // if the parse succeeded again, leave the OLD cache entry behind
        // after the new parse succeeded — a stale-cache race. v17 clears
        // the cache up-front on every fresh requestResolution, so the only
        // cache that survives a successful requestResolution is the one
        // the new request writes.
        //
        // Note: the symmetric cleanups in forceResetMarket and the
        // parse-failure branch of handleAgentResponse are defensive — the
        // underfunded-inference path that populates the cache also rolls
        // the market back to Open, so forceResetMarket reverts with
        // NotStuck and the parse-failure branch sees an already-empty
        // cache (cleared by the v17 line in requestResolution). Code
        // review + the v17 manifest bump cover those sites; we test the
        // load-bearing requestResolution path here.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        uint256 inferenceDeposit = market.getInferenceDeposit();

        // First requestResolution + underfunded parse callback → cache
        // populated, market rolled back to Open.
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        vm.deal(address(market), 0.1 ether);
        assertLt(address(market).balance, inferenceDeposit, "underfunded for inference");
        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );
        assertTrue(bytes(market.marketParseResult(marketId)).length > 0, "cache populated after underfunded parse");
        assertEq(uint256(market.getMarket(marketId).status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "rolled back");

        // A second requestResolution must clear the stale cache entry up-front.
        vm.deal(address(market), 2 ether);
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        assertEq(
            bytes(market.marketParseResult(marketId)).length,
            0,
            "v17: stale cache cleared on fresh requestResolution"
        );
    }

    function testAgentContextExposesParseResultCached() public {
        // v17 (L1): AgentMarketContext.parseResultCached should be true
        // when the cache is populated and false otherwise. External
        // agents use this to decide whether to call retryInferenceFromCache
        // vs the standard requestResolution path from a single read.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        uint256 inferenceDeposit = market.getInferenceDeposit();

        // Before any resolution: no cache.
        AutonomousPredictionMarket.AgentMarketContext memory ctx = market.getAgentMarketContext(marketId);
        assertFalse(ctx.parseResultCached, "no cache before resolution");

        // Run requestResolution + underfunded-inference path to populate.
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        vm.deal(address(market), 0.1 ether);
        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        ctx = market.getAgentMarketContext(marketId);
        assertTrue(ctx.parseResultCached, "cache present after underfunded inference");

        // Drain the cache via retryInferenceFromCache with a funded contract.
        vm.deal(address(market), inferenceDeposit + 0.1 ether);
        market.retryInferenceFromCache(marketId);
        ctx = market.getAgentMarketContext(marketId);
        assertFalse(ctx.parseResultCached, "cache consumed by retry");
    }

    function testRequestResolutionPreservesCacheOnUnderfundedRevert() public {
        // v28 (L1): pre-v28, requestResolution cleared the parse-result cache
        // BEFORE the InsufficientContractBalance check. A failed call (user
        // manually invokes on an underfunded contract, or the relayer's
        // pre-fund check is wrong) reverted AND destroyed the cache as a
        // side effect — removing the relayer's only retry path
        // (retryInferenceFromCache) for that market. v28 moved the clear to
        // AFTER the funding check, so a reverted requestResolution leaves
        // the cache populated and the market in its prior state (Open, cache
        // present, no parse request in flight) — identical to pre-call.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        uint256 inferenceDeposit = market.getInferenceDeposit();

        // Populate the cache via the underfunded-inference rollback path:
        // requestResolution succeeds (funded), parse callback succeeds, but
        // the inference callback sees the contract is underfunded for
        // inference → emits ResolutionFailed(stage=Inference) +
        // InferenceUnderfunded, rolls market back to Open WITH the cache.
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        vm.deal(address(market), 0.1 ether);
        assertLt(address(market).balance, inferenceDeposit, "underfunded for inference");
        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );
        assertTrue(bytes(market.marketParseResult(marketId)).length > 0, "cache populated after underfunded parse");
        assertEq(uint256(market.getMarket(marketId).status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "rolled back to Open");

        // Drain the contract below the total resolution deposit. The cache
        // must survive the next requestResolution's InsufficientContractBalance
        // revert (the v28 L1 invariant). We call with msg.value=0 (a naive
        // user, or the relayer's pre-fund check misfiring) — passing
        // value=totalDeposit would self-fund the contract and bypass the
        // revert.
        vm.deal(address(market), 0);
        assertLt(address(market).balance, totalDeposit, "contract underfunded for total deposit");

        vm.prank(resolver);
        vm.expectRevert(AutonomousPredictionMarket.InsufficientContractBalance.selector);
        market.requestResolution(marketId);

        // v28 invariant: cache survives a failed requestResolution.
        assertTrue(
            bytes(market.marketParseResult(marketId)).length > 0,
            "v28: cache preserved on underfunded requestResolution revert"
        );
        assertEq(
            uint256(market.getMarket(marketId).status),
            uint256(AutonomousPredictionMarket.MarketStatus.Open),
            "v28: market still Open after revert"
        );
    }

    function testAgentManifestAdvertisesV17() public {
        // v17 surfaces: marketParseResult cleanup invariant, parseResultCached
        // in AgentMarketContext, the manifest version bump.
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v17"), "manifest advertises v17");
        assertTrue(
            _contains(manifest, "parseResultCached") || _contains(manifest, "marketParseResult"),
            "manifest mentions the v17 cache invariant"
        );
    }

    function testAgentManifestAdvertisesV19() public {
        // v19 surfaces: hoisted marketParseResult cleanup in handleInferenceCallback
        // (the v19 H1 fix), and the version bump itself.
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v19") || _contains(manifest, "v40"), "manifest advertises v19+");
        assertTrue(
            _contains(manifest, "handleInferenceCallback"),
            "manifest documents the v19 H1 cleanup site"
        );
    }

    function testAgentManifestAdvertisesV40() public {
        // v40 surfaces: getUserMarkets(address) → uint256[] view, and the
        // version bump itself. The body text still mentions v19 (the H1
        // cleanup site) but the version label at the top of the string is
        // the current v40.
        string memory manifest = market.agentManifest();
        assertTrue(_contains(manifest, "v40"), "manifest advertises v40");
        assertTrue(
            _contains(manifest, "getUserMarkets"),
            "manifest documents the v40 user-position view"
        );
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool isMatch = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) return true;
        }
        return false;
    }

    function testFuzzPayoutMatchesStakeProportion(uint256 aliceStake, uint256 bobStake) public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        aliceStake = bound(aliceStake, 0.01 ether, 1 ether);
        bobStake = bound(bobStake, 0.01 ether, 1 ether);

        vm.deal(alice, aliceStake);
        vm.deal(bob, bobStake);

        vm.prank(alice);
        market.bet{value: aliceStake}(marketId, AutonomousPredictionMarket.BetOption.Yes);
        vm.prank(bob);
        market.bet{value: bobStake}(marketId, AutonomousPredictionMarket.BetOption.No);

        uint256 totalPool = aliceStake + bobStake;
        uint256 yesBefore = alice.balance;
        market.forceResolve(marketId, true);
        vm.prank(alice);
        market.claimWinnings(marketId);

        uint256 paid = alice.balance - yesBefore;
        assertLe(paid, totalPool, "Payout must not exceed pool");
        assertEq(paid, totalPool, "Sole YES bettor should sweep entire pool");
    }

    function testFuzzMultiWinnerPayoutMatchesProportion(
        uint256 aliceStake,
        uint256 bobStake,
        uint256 carolStake
    ) public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        aliceStake = bound(aliceStake, 0.01 ether, 1 ether);
        bobStake = bound(bobStake, 0.01 ether, 1 ether);
        carolStake = bound(carolStake, 0.01 ether, 1 ether);

        address carol = makeAddr("carol");
        vm.deal(alice, aliceStake);
        vm.deal(bob, bobStake);
        vm.deal(carol, carolStake);

        vm.prank(alice);
        market.bet{value: aliceStake}(marketId, AutonomousPredictionMarket.BetOption.Yes);
        vm.prank(bob);
        market.bet{value: bobStake}(marketId, AutonomousPredictionMarket.BetOption.Yes);
        vm.prank(carol);
        market.bet{value: carolStake}(marketId, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(marketId, true);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claimWinnings(marketId);
        uint256 alicePayout = alice.balance - aliceBefore;

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);
        uint256 bobPayout = bob.balance - bobBefore;

        uint256 totalPool = aliceStake + bobStake + carolStake;
        uint256 expectedAlice = (aliceStake * totalPool) / (aliceStake + bobStake);
        uint256 expectedBob = (bobStake * totalPool) / (aliceStake + bobStake);
        assertEq(alicePayout, expectedAlice, "Alice payout");
        assertEq(bobPayout, expectedBob, "Bob payout");
        assertLe(alicePayout + bobPayout, totalPool, "Payouts must not exceed pool");
    }

    function testFuzzLoserCannotClaimAfterResolve(uint256 stake) public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        stake = bound(stake, 0.01 ether, 1 ether);
        vm.deal(alice, stake);
        vm.prank(alice);
        market.bet{value: stake}(marketId, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(marketId, true);

        vm.prank(alice);
        vm.expectRevert(AutonomousPredictionMarket.NoWinningBets.selector);
        market.claimWinnings(marketId);
    }

    function testReentrancyGuardOnClaimWinnings() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        market.seedUserYesBet(address(this), marketId, 0.5 ether);
        market.forceResolve(marketId, true);
        market.forceResolve(marketId, true);

        ReentrantClaimer attacker = new ReentrantClaimer(market);
        attacker.arm(marketId);
        vm.deal(address(attacker), 0.5 ether);

        uint256 totalPool = market.getTotalPool(marketId);
        market.seedUserYesBet(address(attacker), marketId, 0.1 ether);
        (bool ok,) = address(market).call{value: 0.4 ether}("");
        assertTrue(ok);

        attacker.attack();
        assertTrue(attacker.attackFailed(), "reentrant call must be reverted by nonReentrant");
    }

    function testFuzzQuestionLengthBoundaries(uint8 length) public {
        uint256 capped = uint256(length);
        if (capped == 0) {
            vm.expectRevert(AutonomousPredictionMarket.QuestionEmpty.selector);
            market.createMarket(_repeat("q", 0), "https://example.com", 300);
            return;
        }
        if (capped <= market.MAX_QUESTION_LENGTH()) {
            market.createMarket(_repeat("q", capped), "https://example.com", 300);
        } else {
            vm.expectRevert(AutonomousPredictionMarket.QuestionTooLong.selector);
            market.createMarket(_repeat("q", capped), "https://example.com", 300);
        }
    }

    function _repeat(string memory c, uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        bytes memory cb = bytes(c);
        for (uint256 i = 0; i < n; i++) {
            b[i] = cb[0];
        }
        return string(b);
    }

    // -----------------------------------------------------------------------
    // Autonomous market generation (inferToolsChat) tests
    // -----------------------------------------------------------------------

    function _inferToolsResponse(string memory finishReason, bytes[] memory toolCalls)
        internal
        view
        returns (bytes memory)
    {
        string[] memory updatedRoles = new string[](0);
        string[] memory updatedMessages = new string[](0);
        string[] memory pendingToolCallIds = new string[](toolCalls.length);
        for (uint256 i = 0; i < toolCalls.length; i++) {
            pendingToolCallIds[i] = string.concat("call_", vm.toString(i));
        }
        return abi.encode(
            finishReason, "", updatedRoles, updatedMessages, pendingToolCallIds, toolCalls
        );
    }

    function _createMarketCall(string memory q, string memory src, uint256 dur)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSignature("createMarket(string,string,uint256)", q, src, dur);
    }

    function _generationResponses(bytes memory inferToolsResult)
        internal
        view
        returns (Response[] memory)
    {
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xBEEF),
            result: inferToolsResult,
            status: ResponseStatus.Success,
            receipt: 123,
            timestamp: block.timestamp,
            executionCost: 0
        });
        return responses;
    }

    function _fundContractForGeneration() internal {
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        vm.deal(address(this), requiredDeposit);
        (bool ok,) = address(market).call{value: requiredDeposit}("");
        assertTrue(ok, "pre-fund");
    }

    function testRequestMarketGenerationRejectsEmptyTopic() public {
        vm.expectRevert(AutonomousPredictionMarket.InvalidTopic.selector);
        market.requestMarketGeneration("");
    }

    function testRequestMarketGenerationRejectsLongTopic() public {
        string memory longTopic = _repeat("a", market.MAX_TOPIC_LENGTH() + 1);
        vm.expectRevert(AutonomousPredictionMarket.TopicTooLong.selector);
        market.requestMarketGeneration(longTopic);
    }

    function testRequestMarketGenerationRevertsWhenContractUnderfunded() public {
        vm.expectRevert(AutonomousPredictionMarket.InsufficientContractBalance.selector);
        market.requestMarketGeneration("Some topic");
    }

    function testRequestMarketGenerationHappyPath() public {
        _fundContractForGeneration();

        bytes[] memory tools = new bytes[](1);
        tools[0] = _createMarketCall("Will ETH hit $5k in 2026?", "https://example.com/eth", 3600);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        uint256 requestId = _primeInferToolsAndCall(inferResult, "Will ETH hit $5k in 2026?");

        assertEq(market.nextMarketId(), 2, "nextMarketId");
        AutonomousPredictionMarket.Market memory m = market.getMarket(1);
        assertEq(m.question, "Will ETH hit $5k in 2026?", "question");
        assertEq(m.resolutionSource, "https://example.com/eth", "source");
        assertEq(m.endTime, block.timestamp + 3600, "endTime");
        assertEq(m.creator, market.AGENT_CREATOR_SENTINEL(), "creator is sentinel");
        assertEq(uint256(market.requestStage(requestId)), uint256(AutonomousPredictionMarket.RequestStage.None), "stage cleared");
    }

    function _primeInferToolsAndCall(bytes memory inferResult, string memory topic)
        internal
        returns (uint256 requestId)
    {
        // Re-fund the contract so each request has the inference deposit available
        // (createRequest{value: requiredDeposit} forwards it to the platform).
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        vm.deal(address(this), requiredDeposit);
        (bool ok,) = address(market).call{value: requiredDeposit}("");
        assertTrue(ok, "refund for next call");

        // Step 1: caller requests generation. The mock returns requestId = 1 (first call).
        requestId = market.requestMarketGeneration(topic);
        // Step 2: simulate the platform calling back with the inferTools result.
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );
    }

    function testRequestMarketGenerationEmitsDuplicateToolCallAdvisory() public {
        // v14: when the agent returns multiple createMarket tool calls in one
        // response we still execute the first call (single market created) and
        // emit a DuplicateToolCall advisory so operators can spot misbehaving
        // prompts / models. The market is still created; this is purely an
        // observability signal, not a failure path.
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](3);
        tools[0] = _createMarketCall("First?", "https://example.com/first", 600);
        tools[1] = _createMarketCall("Second?", "https://example.com/second", 600);
        tools[2] = _createMarketCall("Third?", "https://example.com/third", 600);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = _primeInferToolsAndCall(inferResult, "Topic with extra tool calls");

        // Only the first call is executed.
        assertEq(market.nextMarketId(), 2, "exactly one market created");
        AutonomousPredictionMarket.Market memory m = market.getMarket(1);
        assertEq(m.question, "First?", "first tool call wins");

        // The DuplicateToolCall advisory should fire with the total count of
        // matching createMarket selector calls (3).
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 dupSig = keccak256("DuplicateToolCall(uint256,uint256)");
        bool sawDup;
        uint256 reportedCount;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == dupSig && uint256(logs[i].topics[1]) == requestId) {
                sawDup = true;
                reportedCount = abi.decode(logs[i].data, (uint256));
                break;
            }
        }
        assertTrue(sawDup, "DuplicateToolCall emitted");
        assertEq(reportedCount, 3, "advisory reports total tool-call count");
    }

    function testRequestMarketGenerationEmitsEvents() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        tools[0] = _createMarketCall("Question?", "https://s", 600);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        // We expect two emits; vm.recordLogs captures them in order.
        vm.recordLogs();
        _primeInferToolsAndCall(inferResult, "Question?");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Find the GenerationRequested and MarketCreatedByAgent events.
        bytes32 genReqSig = keccak256("GenerationRequested(uint256,string)");
        bytes32 marketByAgentSig = keccak256("MarketCreatedByAgent(uint256,uint256,address)");
        bool sawGenReq;
        bool sawMarketByAgent;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == genReqSig) sawGenReq = true;
            if (logs[i].topics[0] == marketByAgentSig) sawMarketByAgent = true;
        }
        assertTrue(sawGenReq, "GenerationRequested emitted");
        assertTrue(sawMarketByAgent, "MarketCreatedByAgent emitted");
    }

    function testRequestMarketGenerationFailsWhenNoToolCalls() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](0);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "empty-tool-calls");
    }

    function testRequestMarketGenerationFailsWhenFinishReasonIsStop() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](0);
        bytes memory inferResult = _inferToolsResponse("stop", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "no-tool-calls");
    }

    function testRequestMarketGenerationFailsWhenWrongSelector() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        // Random non-createMarket call: bet(uint256,uint8)
        tools[0] = abi.encodeWithSignature("bet(uint256,uint8)", uint256(1), uint8(0));
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "wrong-selector");
    }

    function testRequestMarketGenerationFailsWhenCreateMarketReverts() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        // Question is 501 chars -> QuestionTooLong -> inner createMarket reverts.
        tools[0] = _createMarketCall(_repeat("q", 501), "https://s", 600);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "QuestionTooLong");
    }

    function testRequestMarketGenerationDecodesInnerDurationTooShort() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        // duration 100s < MIN_DURATION (300) -> DurationTooShort.
        tools[0] = _createMarketCall("Q?", "https://s", 100);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "DurationTooShort");
    }

    function testRequestMarketGenerationDecodesInnerInvalidSourceUrl() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        // ftp:// URL is not http(s) -> InvalidSourceUrl.
        tools[0] = _createMarketCall("Q?", "ftp://example.com", 600);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "InvalidSourceUrl");
    }

    // v18 (H2): DurationTooLong was missing from _describeCreateRevert, so the
    // generation pipeline emitted the generic "create-reverted" reason for an
    // overlong duration. That masked a real misconfiguration (a prompt that
    // asks the agent to set 86401+ seconds) from the operator. Add a
    // regression test that pins the decoded reason to the inner error name.
    function testRequestMarketGenerationDecodesInnerDurationTooLong() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        // duration > MAX_DURATION (86400) -> DurationTooLong.
        tools[0] = _createMarketCall("Q?", "https://s", market.MAX_DURATION() + 1);
        bytes memory inferResult = _inferToolsResponse("tool_calls", tools);

        vm.recordLogs();
        uint256 requestId = market.requestMarketGeneration("Some topic");
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId, _generationResponses(inferResult), ResponseStatus.Success, _emptyRequest()
        );

        assertEq(market.nextMarketId(), 1, "no market created");
        _assertGenerationFailed(requestId, "DurationTooLong");
    }

    function testRequestMarketGenerationRefundsOverfunding() public {
        _fundContractForGeneration();
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        uint256 overpay = requiredDeposit * 2;
        vm.deal(address(this), overpay);

        uint256 callerBefore = address(this).balance;
        market.requestMarketGeneration{value: overpay}("Some topic");
        uint256 callerAfter = address(this).balance;

        // We sent `overpay`, no market was created, so we should be refunded the full overpay.
        assertEq(callerBefore, callerAfter, "full refund when pre-funded");
    }

    function testRequestMarketGenerationPartialFunding() public {
        (uint256 requiredDeposit,,) = market.getGenerationFundingStatus();
        uint256 preFund = 0.1 ether;
        vm.deal(address(market), preFund);

        uint256 topUp = requiredDeposit - preFund;
        vm.deal(address(this), topUp);
        uint256 callerBefore = address(this).balance;

        uint256 requestId = market.requestMarketGeneration{value: topUp}("Partial topic");

        // Caller should not be refunded.
        assertEq(address(this).balance, callerBefore - topUp, "no refund on partial");
        // requestId is non-zero (mock incremented).
        assertEq(requestId, 1, "first request id");
    }

    function testRequestMarketGenerationCallbackOnlyPlatform() public {
        vm.prank(alice);
        vm.expectRevert(AutonomousPredictionMarket.OnlyPlatform.selector);
        market.handleGenerationCallback(
            1, _generationResponses(_inferToolsResponse("tool_calls", new bytes[](0))), ResponseStatus.Success, _emptyRequest()
        );
    }

    function testRequestMarketGenerationCallbackRevertsOnPending() public {
        _fundContractForGeneration();
        uint256 requestId = market.requestMarketGeneration("Some topic");

        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.GenerationStillPending.selector);
        market.handleGenerationCallback(
            requestId, new Response[](0), ResponseStatus.Pending, _emptyRequest()
        );
    }

    function testRequestMarketGenerationCallbackFailsForUnknownStage() public {
        vm.prank(PLATFORM);
        vm.expectRevert(AutonomousPredictionMarket.InvalidStage.selector);
        market.handleGenerationCallback(
            99, _generationResponses(_inferToolsResponse("tool_calls", new bytes[](0))), ResponseStatus.Success, _emptyRequest()
        );
    }

    function testScanAgentCreatedMarketsFindsSentinelMarkets() public {
        _fundContractForGeneration();
        bytes[] memory tools = new bytes[](1);
        tools[0] = _createMarketCall("AI market 1", "https://s", 600);
        _primeInferToolsAndCall(_inferToolsResponse("tool_calls", tools), "AI market 1");

        tools[0] = _createMarketCall("AI market 2", "https://s", 600);
        _primeInferToolsAndCall(_inferToolsResponse("tool_calls", tools), "AI market 2");

        (uint256[] memory ids,) = market.scanAgentCreatedMarkets(0, 10);
        assertEq(ids.length, 2, "two agent-created markets");
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function testScanAgentCreatedMarketsIgnoresManualMarkets() public {
        _fundContractForGeneration();
        // One manual market first.
        market.createMarket("Manual", "https://s", 600);
        // Then one agent-created market.
        bytes[] memory tools = new bytes[](1);
        tools[0] = _createMarketCall("AI market", "https://s", 600);
        _primeInferToolsAndCall(_inferToolsResponse("tool_calls", tools), "AI market");

        (uint256[] memory ids,) = market.scanAgentCreatedMarkets(0, 10);
        assertEq(ids.length, 1, "only agent-created");
        assertEq(ids[0], 2, "id 2 is the agent-created one");
    }

    // v16 (L1): handleGenerationCallback must clear generationRequestedAt on
    // every exit, mirroring the v15 parseRequestedAt cleanup invariant. v15
    // left the timestamp set, so getAgentMarketContext readers saw a stale
    // timestamp on a requestId that had already been processed.
    function testHandleGenerationCallbackClearsGenerationRequestedAt() public {
        _fundContractForGeneration();
        uint256 requestId = market.requestMarketGeneration("test topic");
        assertGt(market.generationRequestedAt(requestId), 0, "timestamp set on submit");

        bytes[] memory tools = new bytes[](1);
        tools[0] = _createMarketCall("AI market", "https://s", 600);

        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId,
            _generationResponses(_inferToolsResponse("tool_calls", tools)),
            ResponseStatus.Success,
            _emptyRequest()
        );

        // After the callback, generationRequestedAt is cleared. This is the
        // L1 invariant — same shape as v15's parseRequestedAt cleanup.
        assertEq(market.generationRequestedAt(requestId), 0, "timestamp cleared on success");
    }

    function testHandleGenerationCallbackClearsGenerationRequestedAtOnFailure() public {
        // v16 (L1): the L1 cleanup must also run on the failure branches
        // (no-success, no-tool-calls, etc.) — not just the success path.
        _fundContractForGeneration();
        uint256 requestId = market.requestMarketGeneration("test topic");
        assertGt(market.generationRequestedAt(requestId), 0, "timestamp set on submit");

        // Trigger the "no-tool-calls" branch (finishReason="stop").
        bytes[] memory empty = new bytes[](0);
        vm.prank(PLATFORM);
        market.handleGenerationCallback(
            requestId,
            _generationResponses(_inferToolsResponse("stop", empty)),
            ResponseStatus.Success,
            _emptyRequest()
        );

        assertEq(market.generationRequestedAt(requestId), 0, "timestamp cleared on failure branch");
    }

    // -----------------------------------------------------------------------
    // v16 (M1) tests: retryInferenceFromCache
    // -----------------------------------------------------------------------

    function testRetryInferenceFromCacheHappyPath() public {
        // v16 (M1): contract has the full resolution deposit at
        // requestResolution, but the parse callback arrives after a drain
        // has put the contract below the inference deposit. The contract
        // caches the parse result, reopens the market, and emits
        // InferenceUnderfunded. A subsequent retryInferenceFromCache — with
        // the contract refilled — succeeds without re-running the parse.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        uint256 inferenceDeposit = market.getInferenceDeposit();

        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Drain below the inference deposit so the underfunded branch runs.
        vm.deal(address(market), 0.1 ether);
        assertLt(address(market).balance, inferenceDeposit, "underfunded");

        // Expect InferenceUnderfunded with the parse result embedded.
        vm.expectEmit(true, true, false, true, address(market));
        emit AutonomousPredictionMarket.InferenceUnderfunded(
            marketId, 1, "Paris is the capital of France."
        );
        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );

        // The cache is populated.
        assertEq(market.marketParseResult(marketId), "Paris is the capital of France.", "cache populated");
        // Market is back to Open with no parse request in flight.
        AutonomousPredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Open), "market open");
        assertEq(m.parseRequestId, 0, "parse request cleared");

        // Refill the contract for the inference call, then retry from cache.
        // The relayer would do this; we simulate by dealing STT to the
        // contract (since the relayer EOA is in the relayer, not the test).
        vm.deal(address(this), inferenceDeposit);
        (bool ok,) = address(market).call{value: inferenceDeposit}("");
        assertTrue(ok, "refund");
        assertGe(address(market).balance, inferenceDeposit, "refilled");

        // Retry from cache: should create the inference request (id=2) and
        // roll the market to Resolving. The cache is consumed.
        uint256 newReqId = market.retryInferenceFromCache(marketId);
        assertEq(newReqId, 2, "second platform request id");
        m = market.getMarket(marketId);
        assertEq(uint256(m.status), uint256(AutonomousPredictionMarket.MarketStatus.Resolving), "resolving");
        assertEq(m.inferenceRequestId, 2, "inference request set");
        assertGt(m.inferenceRequestedAt, 0, "inference timestamp set");
        assertEq(bytes(market.marketParseResult(marketId)).length, 0, "cache consumed");
    }

    function testRetryInferenceFromCacheRequiresCachedResult() public {
        // No cache → InferenceNotCached. A relayer that calls this on a
        // market whose parse hasn't run would just re-trigger the parse,
        // not skip it.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);

        // Fast-forward past endTime; the market is now Resolving (parse
        // request is in flight). Cancel the parse request by warping past
        // STALE_REQUEST_TIMEOUT and force-resetting, so the market is Open
        // with no parse request in flight AND no cache. Then retry must
        // reject with InferenceNotCached.
        vm.warp(block.timestamp + market.STALE_REQUEST_TIMEOUT() + 1);
        market.forceResetMarket(marketId);

        vm.deal(address(this), market.getInferenceDeposit());
        (bool ok,) = address(market).call{value: market.getInferenceDeposit()}("");
        assertTrue(ok);

        vm.expectRevert(AutonomousPredictionMarket.InferenceNotCached.selector);
        market.retryInferenceFromCache(marketId);
    }

    function testRetryInferenceFromCacheRequiresFundedContract() public {
        // Set up the cache by running the underfunded path.
        uint256 marketId = _createEndedMarket();
        uint256 totalDeposit = market.getRequiredDeposit();
        vm.deal(resolver, totalDeposit);
        vm.prank(resolver);
        market.requestResolution{value: totalDeposit}(marketId);
        vm.deal(address(market), 0.1 ether); // drain

        vm.prank(PLATFORM);
        market.handleAgentResponse(
            1, _successfulResponse("Paris is the capital of France."), ResponseStatus.Success, _emptyRequest()
        );
        assertEq(market.marketParseResult(marketId), "Paris is the capital of France.", "cache populated");

        // Now drain the contract again so retry can't pay.
        vm.deal(address(market), 0);

        vm.expectRevert(AutonomousPredictionMarket.InsufficientContractBalance.selector);
        market.retryInferenceFromCache(marketId);
    }

    // -----------------------------------------------------------------------
    // v40 (L0): per-user market enumeration for the My Bets tab.
    //
    // The frontend used to require loading every market page (O(N) RPC
    // round-trips) and reading userYesBets + userNoBets for each to find
    // the user's positions. The new getUserMarkets(address) view + the
    // userMarketIds storage populated by bet() lets useMyBets do a single
    // targeted read in O(K) where K = the user's position count.
    // -----------------------------------------------------------------------

    function testGetUserMarketsEmptyForFreshUser() public {
        // Address with no bets returns an empty array, not a revert.
        assertEq(market.getUserMarkets(alice).length, 0, "fresh user should have empty array");
    }

    function testGetUserMarketsReturnsBettedMarkets() public {
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);
        uint256 m2 = market.createMarket("Q2?", "https://b.example", 300);
        uint256 m3 = market.createMarket("Q3?", "https://c.example", 300);

        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        market.bet{value: 0.1 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        market.bet{value: 0.1 ether}(m2, AutonomousPredictionMarket.BetOption.No);
        market.bet{value: 0.1 ether}(m3, AutonomousPredictionMarket.BetOption.Yes);
        vm.stopPrank();

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        assertEq(aliceMarkets.length, 3, "alice should have 3 markets");
        assertEq(aliceMarkets[0], m1, "first bet first");
        assertEq(aliceMarkets[1], m2, "second bet second");
        assertEq(aliceMarkets[2], m3, "third bet third");
    }

    function testGetUserMarketsNoDuplicatesOnRebet() public {
        // Re-betting on the same market increments the bet amount but does
        // NOT push a duplicate into userMarketIds. The 0-sentinel check in
        // _addUserMarketIfAbsent handles dedup; if it regresses, the array
        // would grow unboundedly with re-bets.
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);
        vm.deal(alice, 1 ether);

        vm.startPrank(alice);
        market.bet{value: 0.1 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        market.bet{value: 0.2 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        market.bet{value: 0.15 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        vm.stopPrank();

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        assertEq(aliceMarkets.length, 1, "re-bets should not duplicate");
        assertEq(aliceMarkets[0], m1, "should still be market 1");
        assertEq(market.userYesBets(alice, m1), 0.45 ether, "amounts aggregate normally");
    }

    function testGetUserMarketsIsolatesUsers() public {
        // Alice and Bob bet on disjoint sets of markets. Each user's
        // getUserMarkets call returns only their own — no cross-leakage.
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);
        uint256 m2 = market.createMarket("Q2?", "https://b.example", 300);
        uint256 m3 = market.createMarket("Q3?", "https://c.example", 300);

        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.bet{value: 0.1 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        vm.prank(alice);
        market.bet{value: 0.1 ether}(m2, AutonomousPredictionMarket.BetOption.No);

        vm.prank(bob);
        market.bet{value: 0.1 ether}(m3, AutonomousPredictionMarket.BetOption.Yes);

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        uint256[] memory bobMarkets = market.getUserMarkets(bob);

        assertEq(aliceMarkets.length, 2, "alice has 2");
        assertEq(aliceMarkets[0], m1, "alice: m1 first");
        assertEq(aliceMarkets[1], m2, "alice: m2 second");
        assertEq(bobMarkets.length, 1, "bob has 1");
        assertEq(bobMarkets[0], m3, "bob: m3");
    }

    function testGetUserMarketsHandlesBothYesAndNoBets() public {
        // A user can bet YES on one market and NO on another; both are
        // tracked. Same user betting both sides of the SAME market is
        // unusual but legal (the contract allows it) and both are tracked
        // as a single entry.
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);
        uint256 m2 = market.createMarket("Q2?", "https://b.example", 300);

        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        market.bet{value: 0.1 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        market.bet{value: 0.1 ether}(m2, AutonomousPredictionMarket.BetOption.No);
        vm.stopPrank();

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        assertEq(aliceMarkets.length, 2, "both YES and NO bets tracked");
    }

    function testGetUserMarketsIgnoresMarketsUserHasNotBetOn() public {
        // Three markets exist; the user only bets on one. The other two
        // don't appear in the user's array.
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);
        uint256 m2 = market.createMarket("Q2?", "https://b.example", 300);
        uint256 m3 = market.createMarket("Q3?", "https://c.example", 300);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.bet{value: 0.1 ether}(m2, AutonomousPredictionMarket.BetOption.Yes);

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        assertEq(aliceMarkets.length, 1, "only bet market is tracked");
        assertEq(aliceMarkets[0], m2, "m2 only");
        assertTrue(aliceMarkets[0] != m1, "m1 absent");
        assertTrue(aliceMarkets[0] != m3, "m3 absent");
    }

    function testGetUserMarketsAfterClaimWinnings() public {
        // After claimWinnings, the bet amounts (userYesBets / userNoBets)
        // are zeroed. The market id STAYS in userMarketIds — the array
        // tracks "user has bet on this market at some point" not "user
        // has an active position". The frontend reads yes/no amounts to
        // distinguish active positions from history. A claimed-and-zeroed
        // position would be filtered out by the frontend's
        // `if (yes === 0n && no === 0n) return null` check.
        uint256 m1 = market.createMarket("Q1?", "https://a.example", 300);

        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);

        vm.prank(alice);
        market.bet{value: 0.6 ether}(m1, AutonomousPredictionMarket.BetOption.Yes);
        vm.prank(bob);
        market.bet{value: 0.4 ether}(m1, AutonomousPredictionMarket.BetOption.No);

        market.forceResolve(m1, true);  // YES wins
        vm.prank(alice);
        market.claimWinnings(m1);

        // Amounts zeroed, market id still in array.
        assertEq(market.userYesBets(alice, m1), 0, "amount zeroed after claim");
        assertEq(market.userNoBets(alice, m1), 0, "other side still zero");

        uint256[] memory aliceMarkets = market.getUserMarkets(alice);
        assertEq(aliceMarkets.length, 1, "market id retained after claim");
        assertEq(aliceMarkets[0], m1, "still the same market");
    }

    function _assertGenerationFailed(uint256 requestId, string memory expectedReason) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("GenerationFailed(uint256,uint8,string)");
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            uint256 loggedReqId = uint256(logs[i].topics[1]);
            if (loggedReqId != requestId) continue;
            (ResponseStatus status, string memory reason) =
                abi.decode(logs[i].data, (ResponseStatus, string));
            if (keccak256(bytes(reason)) == keccak256(bytes(expectedReason))) {
                found = true;
                break;
            }
        }
        assertTrue(found, "GenerationFailed with expected reason not emitted");
    }

    receive() external payable {}
}
