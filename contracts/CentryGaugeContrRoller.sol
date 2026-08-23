// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CentryVeNFT.sol";

contract CentryGaugeController is Ownable2Step, ReentrancyGuard {
    CentryVeNFT public immutable veNFT;

    address[] public gaugeList;
    mapping(address => bool) public isGauge;
    mapping(uint256 => mapping(address => uint256)) public votes;
    mapping(uint256 => mapping(address => uint256)) public voteRawPower;
    mapping(uint256 => uint256) public usedWeight;
    mapping(address => uint256) public gaugeWeight;
    uint256 public totalWeight;

    event GaugeAdded(address indexed gauge);
    event GaugeRemoved(address indexed gauge);
    event Voted(uint256 indexed tokenId, address indexed gauge, uint256 weight);
    event VoteReset(uint256 indexed tokenId, address indexed gauge);

    constructor(address initialOwner, address veNFT_) Ownable(initialOwner) {
        require(veNFT_ != address(0), "gc: venft=0");
        veNFT = CentryVeNFT(veNFT_);
    }

    function addGauge(address gauge) external onlyOwner {
        require(gauge != address(0), "gc: gauge=0");
        require(!isGauge[gauge], "gc: already added");
        isGauge[gauge] = true;
        gaugeList.push(gauge);
        emit GaugeAdded(gauge);
    }

    function removeGauge(address gauge) external onlyOwner {
        require(isGauge[gauge], "gc: not a gauge");
        require(gaugeWeight[gauge] == 0, "gc: active votes remain");
        isGauge[gauge] = false;
        for (uint256 i; i < gaugeList.length; ++i) {
            if (gaugeList[i] == gauge) {
                gaugeList[i] = gaugeList[gaugeList.length - 1];
                gaugeList.pop();
                break;
            }
        }
        emit GaugeRemoved(gauge);
    }

    function vote(uint256 tokenId, address gauge, uint256 weight) external nonReentrant {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");
        require(isGauge[gauge], "gc: not a gauge");
        require(weight <= 100, "gc: weight > 100");
        uint256 power = veNFT.balanceOfNFT(tokenId);
        require(power > 0, "gc: no voting power");

        _removeVote(tokenId, gauge);
        if (weight == 0) return;
        require(usedWeight[tokenId] + weight <= 100, "gc: total weight > 100");

        uint256 rawPower = power * weight / 100;
        votes[tokenId][gauge] = weight;
        voteRawPower[tokenId][gauge] = rawPower;
        usedWeight[tokenId] += weight;
        gaugeWeight[gauge] += rawPower;
        totalWeight += rawPower;
        emit Voted(tokenId, gauge, weight);
    }

    function resetVote(uint256 tokenId, address gauge) external nonReentrant {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");
        _removeVote(tokenId, gauge);
    }

    function resetAllVotes(uint256 tokenId, address[] calldata gauges) external nonReentrant {
        require(veNFT.ownerOf(tokenId) == msg.sender, "gc: not owner");
        for (uint256 i; i < gauges.length; ++i) _removeVote(tokenId, gauges[i]);
    }

    function gaugeWeightFraction(address gauge) external view returns (uint256) {
        if (totalWeight == 0) return 0;
        return gaugeWeight[gauge] * 1e18 / totalWeight;
    }

    function getGauges() external view returns (address[] memory) { return gaugeList; }

    function remainingWeight(uint256 tokenId) external view returns (uint256) {
        uint256 used = usedWeight[tokenId];
        return used >= 100 ? 0 : 100 - used;
    }

    function _removeVote(uint256 tokenId, address gauge) internal {
        uint256 oldWeight = votes[tokenId][gauge];
        if (oldWeight == 0) return;
        uint256 oldRaw = voteRawPower[tokenId][gauge];

        votes[tokenId][gauge] = 0;
        voteRawPower[tokenId][gauge] = 0;
        usedWeight[tokenId] -= oldWeight;

        if (gaugeWeight[gauge] >= oldRaw) gaugeWeight[gauge] -= oldRaw;
        else gaugeWeight[gauge] = 0;
        if (totalWeight >= oldRaw) totalWeight -= oldRaw;
        else totalWeight = 0;

        emit VoteReset(tokenId, gauge);
    }
}
