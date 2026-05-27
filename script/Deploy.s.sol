// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AutonomousPredictionMarket} from "../src/AutonomousPredictionMarket.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        AutonomousPredictionMarket market = new AutonomousPredictionMarket();

        (bool ok,) = address(market).call{value: 0.5 ether}("");
        require(ok, "Prefund failed");

        market.createMarket(
            "Is the capital of France Paris?",
            "https://en.wikipedia.org/wiki/Paris",
            300
        );
        market.createMarket(
            "Did Bitcoin exist before 2010?",
            "https://en.wikipedia.org/wiki/Bitcoin",
            300
        );

        vm.stopBroadcast();

        console2.log("AutonomousPredictionMarket:", address(market));
    }
}
