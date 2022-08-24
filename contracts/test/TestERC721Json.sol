// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.7;

import "@rari-capital/solmate/src/tokens/ERC721.sol";

library Strings {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    /**
     * @dev Converts a `uint256` to its ASCII `string` decimal representation.
     */
    function toString(uint256 value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT licence
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation.
     */
    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0x00";
        }
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
     */
    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }
}

// Used for minting test ERC721s in our tests
contract TestERC721Json is ERC721 {
    using Strings for uint256;
    address public owner;
    uint256 public totalSupply;
    uint256 public maxTotalSupply = 10000;
    uint256 public claimLimit = 1;
    string public base_uri = "";
    mapping(address => uint256) public claimCount;

    modifier onlyOwner() {
        require(msg.sender == owner, 'forbidden');
        _;
    }

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        owner = msg.sender;
    }

    function changeOwner(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), 'no change');
        owner = _newOwner;
    }

    function mint(address to, uint256 tokenId) public returns (bool) {
        _mint(to, tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return bytes(base_uri).length > 0 ? string(abi.encodePacked(base_uri, tokenId.toString(), ".json")) : "";
    }

    function _claim(address to) internal {
        uint256 tokenId = totalSupply;
        require(tokenId < maxTotalSupply, "claim is over");
        claimCount[to] += 1;
        totalSupply++;
        _safeMint(to, tokenId);
    }

    function claim(uint256 amount) public {
        for(uint256 i; i<amount; i++) {
            require(claimCount[msg.sender] <= claimLimit, "over limit");
            _claim(msg.sender);
        }
    }
    
    function ownerClaim(address to, uint256 amount) public onlyOwner {
        for(uint256 i; i<amount; i++) {
            _claim(to);
        }
    }

    function setBaseUrl(string memory uri) external onlyOwner {
        base_uri = uri;
    }
}
