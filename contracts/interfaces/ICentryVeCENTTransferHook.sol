// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentryVeCENTTransferHook {
    function onVeCENTTransfer(
        uint256 tokenId,
        address from,
        address to
    ) external;
}
