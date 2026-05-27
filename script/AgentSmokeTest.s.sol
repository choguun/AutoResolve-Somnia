// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentSmokeTest} from "../src/AgentSmokeTest.sol";

contract DeployAgentSmokeTest is Script {
    function run() external {
        vm.startBroadcast();

        AgentSmokeTest caller = new AgentSmokeTest();
        caller.invoke{value: caller.getDeposit()}();

        vm.stopBroadcast();
        console2.log("AgentSmokeTest deployed:", address(caller));
    }
}
