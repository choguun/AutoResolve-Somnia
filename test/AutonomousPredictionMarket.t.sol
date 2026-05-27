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

contract MarketHarness is AutonomousPredictionMarket {
    function forceResolve(uint256 marketId, bool outcome) external {
        markets[marketId].status = MarketStatus.Resolved;
        markets[marketId].outcome = outcome;
        markets[marketId].resolvedAt = block.timestamp;
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
        vm.expectRevert("Question required");
        market.createMarket("", "https://example.com", 300);
    }

    function testCreateMarketRejectsShortDuration() public {
        vm.expectRevert("Min 5 min duration");
        market.createMarket("Will it rain?", "https://example.com", 60);
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
        vm.expectRevert("No winning bets");
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

        vm.expectRevert("Only platform");
        market.handleAgentResponse(1, _successfulResponse("Evidence"), ResponseStatus.Success, _emptyRequest());

        vm.expectRevert("Only platform");
        market.handleInferenceCallback(1, _successfulResponse("YES"), ResponseStatus.Success, _emptyRequest());
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
        vm.expectRevert("No winning bets");
        market.claimWinnings(marketId);
        vm.stopPrank();
    }
}
