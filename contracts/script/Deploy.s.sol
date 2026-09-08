// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PonsFundTreasury} from "../src/PonsFundTreasury.sol";
import {PonsFundLaunchpad} from "../src/PonsFundLaunchpad.sol";
import {IPonsV2Factory, IPonsV2LaunchAndBuy, IPonsFeeEscrow} from "../src/interfaces/IPonsV2.sol";

/**
 * Deploy the two contracts.
 *
 * ⛔⛔ EVERY ADDRESS IN BOTH CONSTRUCTORS IS `immutable`. There is no setter, no owner and no upgrade
 * path anywhere in either contract, which is the point of them -- and it means a mistake here is
 * permanent. Run this against a fork first, every time, and read the addresses it prints.
 *
 * Against a local fork:
 *   node scripts/rpc-proxy.mjs &
 *   anvil --fork-url http://127.0.0.1:8899 --port 8545 --chain-id 4663 &
 *   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Against mainnet: only after the user has typed `deploy mainnet PONSFUND` in session (kit rule 6),
 * with `--rpc-url http://127.0.0.1:8899` and a real key that is never written to a file.
 */
contract Deploy is Script {
    IPonsV2Factory constant FACTORY = IPonsV2Factory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    IPonsV2LaunchAndBuy constant ROUTER = IPonsV2LaunchAndBuy(0xe33E9E479dF8802cb0866d5d05258bEc4cF62948);

    /**
     * Where every fee ends up. Overridable so a fork run can point at an address it controls, but the
     * default is the production wallet -- a deploy script whose default is a test address is one
     * mistake away from a permanent one.
     */
    function recipient() internal view returns (address) {
        return vm.envOr("PONSFUND_RECIPIENT", 0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97);
    }

    function run() external {
        /* ⚠ Read off the factory, never hardcoded. The escrow is not in Pons's published address
           table, and a wrong address here would make every harvest a silent no-op that reads on the
           site as "no fees yet". */
        address escrow = FACTORY.feeEscrow();
        require(escrow != address(0) && escrow.code.length > 0, "fee escrow did not resolve");
        require(address(FACTORY).code.length > 0, "no Pons factory at this address on this chain");

        vm.startBroadcast();
        PonsFundTreasury treasury = new PonsFundTreasury(recipient(), IPonsFeeEscrow(escrow));
        PonsFundLaunchpad launchpad = new PonsFundLaunchpad(FACTORY, ROUTER, address(treasury));
        vm.stopBroadcast();

        // Checked after broadcast rather than trusted: these two lines are what the site will rely on.
        require(treasury.RECIPIENT() == recipient(), "recipient did not stick");
        require(launchpad.treasury() == address(treasury), "launchpad points elsewhere");

        console.log("");
        console.log("  chain id           :", block.chainid);
        console.log("  fee escrow (Pons)  :", escrow);
        console.log("  PonsFundTreasury   :", address(treasury));
        console.log("  PonsFundLaunchpad  :", address(launchpad));
        console.log("  fees end up at     :", treasury.RECIPIENT());
        console.log("");
        console.log("  launch.config.json -> platform.launchpad =", address(launchpad));
        console.log("  launch.config.json -> vault.address      =", treasury.RECIPIENT());
        console.log("");
    }
}
