// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IAgentRequester,
    Response,
    ResponseStatus,
    Request
} from "./interfaces/IAgentRequester.sol";
import {ILLMInferenceAgent} from "./interfaces/ILLMAgents.sol";

contract AgentSmokeTest {
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant LLM_INFERENCE_COST_PER_AGENT = 0.10 ether;

    mapping(uint256 => bool) public pending;

    event SmokeResult(uint256 indexed requestId, string result);

    function getDeposit() public view returns (uint256) {
        return PLATFORM.getRequestDeposit() + (LLM_INFERENCE_COST_PER_AGENT * SUBCOMMITTEE_SIZE);
    }

    function invoke() external payable returns (uint256 requestId) {
        string[] memory allowed = new string[](2);
        allowed[0] = "YES";
        allowed[1] = "NO";

        bytes memory payload = abi.encodeWithSelector(
            ILLMInferenceAgent.inferString.selector,
            "Is the sky blue during daytime? Answer YES or NO only.",
            "You are a truthful assistant. Answer only YES or NO.",
            false,
            allowed
        );

        uint256 deposit = getDeposit();
        require(msg.value >= deposit, "Insufficient deposit");

        requestId = PLATFORM.createRequest{value: deposit}(
            LLM_INFERENCE_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        pending[requestId] = true;
    }

    function handleResponse(
        uint256 requestId,
        Response[] calldata responses,
        ResponseStatus status,
        Request calldata
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");
        require(pending[requestId], "Unknown request");
        delete pending[requestId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            string memory result = abi.decode(responses[0].result, (string));
            emit SmokeResult(requestId, result);
        }
    }

    receive() external payable {}
}
