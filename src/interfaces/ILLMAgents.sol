// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct OnchainTool {
    string signature;
    string description;
}

interface ILLMInferenceAgent {
    function inferString(
        string memory prompt,
        string memory system,
        bool chainOfThought,
        string[] memory allowedValues
    ) external returns (string memory response);

    function inferToolsChat(
        string[] memory roles,
        string[] memory messages,
        string[] memory mcpServerUrls,
        OnchainTool[] memory onchainTools,
        uint256 maxIterations,
        bool chainOfThought
    )
        external
        returns (
            string memory finishReason,
            string memory response,
            string[] memory updatedRoles,
            string[] memory updatedMessages,
            string[] memory pendingToolCallIds,
            bytes[] memory pendingToolCalls
        );
}

interface IParseWebsiteAgent {
    function ExtractString(
        string memory key,
        string memory description,
        string[] memory options,
        string memory prompt,
        string memory url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external returns (string memory output);
}
