// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IERC20.sol";

/// @notice Extremely minimal ERC20 used only by tests and local deploys.
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public override totalSupply;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        uint256 b = balanceOf[from];
        if (b < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
