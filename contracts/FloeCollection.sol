// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract FloeCollection is ERC721URIStorage, Ownable {
    mapping(address => bool) public minters;
    uint256 private _nextTokenId;

    event MinterUpdated(address indexed account, bool allowed);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) Ownable(msg.sender) {}

    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "FLOE_NOT_MINTER");
        _;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    function mint(address to, uint256 tokenId, string calldata uri) external onlyMinter {
        _mintToken(to, tokenId, uri);
    }

    function mintMultiple(
        address[] calldata to,
        uint256[] calldata tokenIds,
        string[] calldata uris
    ) external onlyMinter returns (bool) {
        require(to.length == tokenIds.length && to.length == uris.length, "FLOE_BATCH_LENGTH_MISMATCH");
        for (uint256 i = 0; i < to.length; i++) {
            _mintToken(to[i], tokenIds[i], uris[i]);
        }
        return true;
    }

    function mintSequential(address to, string calldata uri) external onlyMinter returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId += 1;
        _mintToken(to, tokenId, uri);
        return tokenId;
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function _mintToken(address to, uint256 tokenId, string calldata uri) internal {
        if (tokenId >= _nextTokenId) {
            _nextTokenId = tokenId + 1;
        }
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }
}
