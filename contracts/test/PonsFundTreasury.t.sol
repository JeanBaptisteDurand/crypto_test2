// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PonsFundTreasury} from "../src/PonsFundTreasury.sol";
import {IPonsFeeEscrow} from "../src/interfaces/IPonsV2.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/**
 * A stand-in for Pons's fee escrow, with the one behaviour that matters to these tests: it is a
 * claim-based ledger, and claiming an empty balance REVERTS rather than returning zero.
 *
 * That revert is the whole reason `harvest` wraps its claim in a `try`, so a mock that politely
 * returned zero would test nothing.
 */
contract MockEscrow is IPonsFeeEscrow {
    mapping(address => uint256) public credited;
    mapping(address => mapping(address => uint256)) public creditedToken;

    error NothingToClaim();

    function credit(address who) external payable {
        credited[who] += msg.value;
    }

    function creditToken(address who, address token, uint256 amount) external {
        creditedToken[who][token] += amount;
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function balanceOf(address who) external view returns (uint256) {
        return credited[who];
    }

    function balanceOfToken(address who, address token) external view returns (uint256) {
        return creditedToken[who][token];
    }

    function claim() external returns (uint256 amount) {
        amount = credited[msg.sender];
        if (amount == 0) revert NothingToClaim();
        credited[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }

    function claimToken(address token) external returns (uint256 amount) {
        amount = creditedToken[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        creditedToken[msg.sender][token] = 0;
        IERC20(token).transfer(msg.sender, amount);
    }
}

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/** A recipient that rejects ETH, to prove the treasury surfaces a failed forward instead of eating it. */
contract RejectingRecipient {
    receive() external payable {
        revert("nope");
    }
}

contract PonsFundTreasuryTest is Test {
    PonsFundTreasury treasury;
    MockEscrow escrow;
    address recipient = address(0xBEEF);

    function setUp() public {
        escrow = new MockEscrow();
        treasury = new PonsFundTreasury(recipient, escrow);
    }

    /* ------------------------------------------------------------ construction -- */

    function test_constructor_setsImmutables() public view {
        assertEq(treasury.RECIPIENT(), recipient);
        assertEq(address(treasury.escrow()), address(escrow));
    }

    function test_constructor_rejectsZeroRecipient() public {
        vm.expectRevert(PonsFundTreasury.ZeroAddress.selector);
        new PonsFundTreasury(address(0), escrow);
    }

    function test_constructor_rejectsZeroEscrow() public {
        vm.expectRevert(PonsFundTreasury.ZeroAddress.selector);
        new PonsFundTreasury(recipient, IPonsFeeEscrow(address(0)));
    }

    /* ---------------------------------------------------------------- forward -- */

    function test_forward_sendsEverythingToRecipient() public {
        vm.deal(address(treasury), 3 ether);
        uint256 before = recipient.balance;

        uint256 sent = treasury.forward();

        assertEq(sent, 3 ether);
        assertEq(recipient.balance - before, 3 ether);
        assertEq(address(treasury).balance, 0, "nothing waits in the treasury");
        assertEq(treasury.totalForwarded(address(0)), 3 ether);
    }

    /// A donation sent straight to the address must reach the recipient on the same terms as a fee.
    function test_forward_worksOffBalanceNotOnlyOnHarvest() public {
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok, "treasury accepts a bare transfer");

        treasury.forward();

        assertEq(recipient.balance, 1 ether);
    }

    function test_forward_isANoOpWhenEmpty() public {
        assertEq(treasury.forward(), 0);
        assertEq(treasury.totalForwarded(address(0)), 0);
    }

    /// Permissionless: a stuck balance must be recoverable by anyone, since there is one destination.
    function test_forward_callableByAnyone() public {
        vm.deal(address(treasury), 1 ether);
        vm.prank(address(0xD00D));
        treasury.forward();
        assertEq(recipient.balance, 1 ether);
    }

    function test_forward_revertsWhenRecipientRejects() public {
        PonsFundTreasury hostile = new PonsFundTreasury(address(new RejectingRecipient()), escrow);
        vm.deal(address(hostile), 1 ether);

        vm.expectRevert(PonsFundTreasury.TransferFailed.selector);
        hostile.forward();
    }

    /* ---------------------------------------------------------------- harvest -- */

    function test_harvest_claimsAndForwardsInOneCall() public {
        escrow.credit{value: 2 ether}(address(treasury));

        uint256 gained = treasury.harvest();

        assertEq(gained, 2 ether);
        assertEq(recipient.balance, 2 ether, "fees reach the wallet, not the treasury");
        assertEq(address(treasury).balance, 0);
        assertEq(treasury.totalForwarded(address(0)), 2 ether);
    }

    /**
     * ⭐ The reason the claim is wrapped in a `try`. A cranker harvesting several launches in one
     * transaction must not have the whole batch revert on the one launch that had no fees yet.
     */
    function test_harvest_survivesAnEmptyEscrow() public {
        uint256 gained = treasury.harvest();
        assertEq(gained, 0);
    }

    /// A claim that reverted must not strand a balance the return value never mentioned.
    function test_harvest_forwardsAPreExistingBalanceEvenWhenTheClaimFails() public {
        vm.deal(address(treasury), 5 ether);

        uint256 gained = treasury.harvest();

        assertEq(gained, 0, "the claim itself gained nothing");
        assertEq(recipient.balance, 5 ether, "but the held balance still went out");
    }

    function test_harvest_callableByAnyone() public {
        escrow.credit{value: 1 ether}(address(treasury));
        vm.prank(address(0xD00D));
        treasury.harvest();
        assertEq(recipient.balance, 1 ether);
    }

    function test_harvest_accumulatesTheLifetimeLedger() public {
        escrow.credit{value: 1 ether}(address(treasury));
        treasury.harvest();
        escrow.credit{value: 2 ether}(address(treasury));
        treasury.harvest();

        assertEq(treasury.totalForwarded(address(0)), 3 ether);
    }

    /* ------------------------------------------------------------------ token -- */

    function test_harvestToken_claimsAndForwards() public {
        TestToken token = new TestToken();
        token.approve(address(escrow), 100e18);
        escrow.creditToken(address(treasury), address(token), 100e18);

        uint256 gained = treasury.harvestToken(address(token));

        assertEq(gained, 100e18);
        assertEq(token.balanceOf(recipient), 100e18);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(treasury.totalForwarded(address(token)), 100e18);
    }

    function test_harvestToken_rejectsTheNativeSentinel() public {
        vm.expectRevert(PonsFundTreasury.ZeroAddress.selector);
        treasury.harvestToken(address(0));
    }

    function test_forwardToken_isANoOpWhenEmpty() public {
        TestToken token = new TestToken();
        assertEq(treasury.forwardToken(address(token)), 0);
    }

    function test_harvestMany_doesNativeAndTokensInOneTransaction() public {
        TestToken token = new TestToken();
        token.approve(address(escrow), 50e18);
        escrow.creditToken(address(treasury), address(token), 50e18);
        escrow.credit{value: 1 ether}(address(treasury));

        address[] memory assets = new address[](1);
        assets[0] = address(token);
        treasury.harvestMany(assets);

        assertEq(recipient.balance, 1 ether);
        assertEq(token.balanceOf(recipient), 50e18);
    }

    /* ---------------------------------------------------------- no owner power -- */

    /**
     * The trust statement, asserted rather than described: there is no function on this contract
     * that can move money anywhere but `RECIPIENT`, and no function that can change `RECIPIENT`.
     *
     * A test cannot prove the absence of a function, so this asserts the two things a reader would
     * check by hand -- that the ABI has no setter and no owner -- by calling their likely selectors
     * and requiring that nothing answers.
     */
    function test_hasNoSetterAndNoOwner() public {
        string[6] memory absent = [
            "setRecipient(address)",
            "transferOwnership(address)",
            "owner()",
            "withdraw(uint256)",
            "execute(address,bytes)",
            "pause()"
        ];
        for (uint256 i = 0; i < absent.length; i++) {
            (bool ok,) = address(treasury).call(abi.encodeWithSignature(absent[i]));
            assertFalse(ok, absent[i]);
        }
    }
}
