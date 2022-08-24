// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.7;

import "@rari-capital/solmate/src/tokens/ERC721.sol";

contract TestERC721Base64 is ERC721 {
    bytes internal constant TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    address public owner;
    uint256 public totalSupply;
    uint256 public maxTotalSupply = 10000;
    uint256 public claimLimit = 1;
    mapping(address => uint256) public claimCount;

    struct Param {
        uint256 min;
        uint256 max;
    }

    struct Info {
        bytes32 key;
        uint256 value;
        string name;
    }

    mapping(bytes32 => Param) public parameters;
    string[] public names;

    modifier onlyOwner() {
        require(msg.sender == owner, 'forbidden');
        _;
    }

    function changeOwner(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), 'no change');
        owner = _newOwner;
    }
    
    function random(string memory input) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(input)));
    }
    
    function pluck(uint256 tokenId, string memory name) public view returns (uint256) {
        bytes32 key = stringToBytes32(name);
        uint256 rand = random(string(abi.encodePacked(name, toString(tokenId))));
        uint count = 1 + parameters[key].max - parameters[key].min;
        uint256[] memory sourceArray = new uint256[](count);
        for(uint256 i; i<count; i++) {
            sourceArray[i] = parameters[key].min + i;
        }
        return sourceArray[rand % sourceArray.length];
    }

    function pluckToString(uint256 tokenId, string memory name) public view returns (string memory) {
        uint256 value = pluck(tokenId, name);
        return string(abi.encodePacked(name, ": ", toString(value)));
    }

    function tokenURI(uint256 tokenId) override public view returns (string memory) {
        string memory output = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 350"><style>.base { fill: white; font-family: serif; font-size: 14px; }</style><rect width="100%" height="100%" fill="black" />';
        uint256 h;
        for(uint256 i; i<names.length; i++) {
            h += 20;
            output = string(abi.encodePacked(output, '<text x="10" y="', toString(h), '" class="base">', pluckToString(tokenId, names[i]), '</text>'));
        }
        
        output = string(abi.encodePacked(output, '</svg>'));
        string memory json = encode(bytes(string(abi.encodePacked('{"name": "Bag #', toString(tokenId), '", "description": "Treasuresea is randomized adventurer gear generated and stored on chain. Stats, images, and other functionality are intentionally omitted for others to interpret. Feel free to use Treasuresea in any way you want.", "image": "data:image/svg+xml;base64,', encode(bytes(output)), '"}'))));
        output = string(abi.encodePacked('data:application/json;base64,', json));

        return output;
    }

    function tokenInfo(uint256 tokenId) external view returns (Info[] memory) {
        Info[] memory res = new Info[](names.length);
        for(uint256 i; i<names.length; i++) {
            res[i] = Info({
                key: stringToBytes32(names[i]),
                value: pluck(tokenId, names[i]),
                name: names[i]
            });
        }
        return res;
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
    
    function toString(uint256 value) internal pure returns (string memory) {
    // Inspired by OraclizeAPI's implementation - MIT license
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
    
    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        owner = msg.sender;
    }

    function setMaxTotalSupply(uint256 _value) external onlyOwner {
        require(maxTotalSupply < _value, 'must be great maxTotalSupply');
        maxTotalSupply = _value;
    }

    function setClaimLimit(uint256 _value) external onlyOwner {
        require(claimLimit != _value, 'no change');
        claimLimit = _value;
    }

    function getNameLength() external view returns (uint256) {
        return names.length;
    }

    function setNames(string[] calldata _names) external onlyOwner {
        names = new string[](_names.length);
        for(uint256 i; i<_names.length; i++) {
            names[i] = _names[i];
        }
    }

    function setParameter(string memory _name, uint256 _min, uint256 _max) public onlyOwner {
        require(_max >= _min, 'max < min');
        bytes32 key = stringToBytes32(_name);
        parameters[key].min = _min;
        parameters[key].max = _max;
    }

    function setParameters(string[] calldata _names, uint256[] calldata _mins, uint256[] calldata _maxs) external onlyOwner {
        require(_names.length == _mins.length && _mins.length == _maxs.length, 'invalid parameters');
        for(uint256 i; i<_names.length; i++) {
            setParameter(_names[i], _mins[i], _maxs[i]);
        }
    }

    function stringToBytes32(string memory source) public pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
        return result;
    }

    /// @notice Encodes some bytes to the base64 representation
    function encode(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";

        // multiply by 4/3 rounded up
        uint256 encodedLen = 4 * ((len + 2) / 3);

        // Add some extra buffer at the end
        bytes memory result = new bytes(encodedLen + 32);

        bytes memory table = TABLE;

        assembly {
            let tablePtr := add(table, 1)
            let resultPtr := add(result, 32)

            for {
                let i := 0
            } lt(i, len) {

            } {
                i := add(i, 3)
                let input := and(mload(add(data, i)), 0xffffff)

                let out := mload(add(tablePtr, and(shr(18, input), 0x3F)))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(12, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(6, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(input, 0x3F))), 0xFF))
                out := shl(224, out)

                mstore(resultPtr, out)

                resultPtr := add(resultPtr, 4)
            }

            switch mod(len, 3)
            case 1 {
                mstore(sub(resultPtr, 2), shl(240, 0x3d3d))
            }
            case 2 {
                mstore(sub(resultPtr, 1), shl(248, 0x3d))
            }

            mstore(result, encodedLen)
        }

        return string(result);
    }
}
