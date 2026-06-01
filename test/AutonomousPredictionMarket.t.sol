// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
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

    function testCreateMarketRejectsOverlongQuestion() public {
        bytes memory longQuestion = new bytes(market.MAX_QUESTION_LENGTH() + 1);
        for (uint256 i = 0; i < longQuestion.length; i++) {
            longQuestion[i] = "a";
        }

        vm.expectRevert(AutonomousPredictionMarket.QuestionTooLong.selector);
        market.createMarket(string(longQuestion), "https://example.com", 300);
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

    function testBetRejectsZeroValue() public {
        uint256 marketId = market.createMarket("Will it rain?", "https://example.com", 300);
        vm.expectRevert(AutonomousPredictionMarket.BetAmountRequired.selector);
        market.bet{value: 0}(marketId, AutonomousPredictionMarket.BetOption.Yes);
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

        context = market.getAgentMarketContext(activeMarket);
        assertTrue(context.exists);
        assertFalse(context.canResolve);

        (uint256[] memory ids, uint256 nextCursor) = market.scanResolvableMarkets(1, 10);
        assertEq(ids.length, 1);
        assertEq(ids[0], resolvableMarket);
        assertEq(nextCursor, market.nextMarketId());
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

    receive() external payable {}
}
