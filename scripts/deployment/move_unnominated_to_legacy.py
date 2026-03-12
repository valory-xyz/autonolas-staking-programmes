#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ------------------------------------------------------------------------------
#
#   Copyright 2025 Valory AG
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
#
# ------------------------------------------------------------------------------

"""
Moves globals*.json files whose stakingTokenInstanceAddress matches an
unnominated (RemoveNominee) contract into legacy_deployment_scripts/.
"""

import glob
import json
import math
import os
import subprocess
import warnings

warnings.filterwarnings("ignore", module="eth_utils.network")

import requests
from web3 import Web3

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY")
BLOCK_STEP_SIZE = 10000

# VoteWeighting contract on Ethereum mainnet
VW_ADDRESS = "0x95418b46d5566D3d1ea62C12Aea91227E566c5c1"
VW_FIRST_NOMINEE_UPDATE_BLOCK = 21615532

# Provider-name → chain-ID mapping for globals files that lack an explicit chainId
PROVIDER_CHAIN_MAP = {
    "ethereum": 1,
    "gnosis": 100,
    "polygon": 137,
    "base": 8453,
    "mode": 34443,
    "optimistic": 10,
    "arbitrumOne": 42161,
    "celo": 42220,
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LEGACY_DIR = os.path.join(SCRIPT_DIR, "legacy_deployment_scripts")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_abi(contract_address, chain_id):
    url = (
        f"https://api.etherscan.io/v2/api?chainid={chain_id}&module=contract"
        f"&action=getabi&address={contract_address}&apikey={ETHERSCAN_API_KEY}"
    )
    response = requests.get(url)
    data = response.json()
    if data["status"] == "1":
        return json.loads(data["result"])
    raise ValueError(data["result"])


def fetch_removed_nominees(w3):
    """Scan RemoveNominee events from VoteWeighting and return a set of
    (checksumAddress, chainId) tuples."""
    abi = get_abi(VW_ADDRESS, 1)
    vw_contract = w3.eth.contract(address=VW_ADDRESS, abi=abi)

    cur_latest_block = w3.eth.block_number
    num_steps = int(
        math.ceil(
            (cur_latest_block - VW_FIRST_NOMINEE_UPDATE_BLOCK) / BLOCK_STEP_SIZE
        )
    )
    print(
        f"Scanning blocks {VW_FIRST_NOMINEE_UPDATE_BLOCK}..{cur_latest_block} "
        f"({num_steps} steps)"
    )

    removed = set()
    first_block = VW_FIRST_NOMINEE_UPDATE_BLOCK

    for i in range(num_steps):
        latest_block = min(first_block + BLOCK_STEP_SIZE, cur_latest_block)

        entries = vw_contract.events.RemoveNominee.get_logs(
            fromBlock=first_block, toBlock=latest_block
        )

        for entry in entries:
            raw_account = entry.args["account"]
            chain_id = entry.args["chainId"]

            hex_full = w3.to_hex(raw_account)
            trimmed = hex_full[2:].lstrip("0").zfill(40)
            checksum = w3.to_checksum_address("0x" + trimmed)
            removed.add((checksum, chain_id))

        first_block = latest_block + 1

        if i % 100 == 0:
            print(f"  Processed step {i}/{num_steps}")

    print(f"\nFound {len(removed)} unique removed nominees")
    return removed


def resolve_chain_id(data):
    """Return the integer chain ID from a globals JSON dict, or None."""
    # Explicit chainId field
    cid = data.get("chainId")
    if cid is not None:
        try:
            return int(cid)
        except (ValueError, TypeError):
            pass

    # Fall back to providerName mapping
    provider = data.get("providerName", "")
    return PROVIDER_CHAIN_MAP.get(provider)


def move_matching_globals(removed_nominees):
    """Iterate over globals*.json files and move matches into the legacy folder."""
    os.makedirs(LEGACY_DIR, exist_ok=True)

    pattern = os.path.join(SCRIPT_DIR, "globals*.json")
    globals_files = sorted(glob.glob(pattern))
    print(f"\nChecking {len(globals_files)} globals files …")

    moved = []
    for fpath in globals_files:
        with open(fpath, "r") as f:
            data = json.load(f)

        staking_addr = data.get("stakingTokenInstanceAddress", "")
        if not staking_addr:
            continue

        chain_id = resolve_chain_id(data)
        if chain_id is None:
            continue

        # Normalise to checksum for comparison
        try:
            staking_addr = Web3.to_checksum_address(staking_addr)
        except Exception:
            continue

        if (staking_addr, chain_id) in removed_nominees:
            dest = os.path.join(LEGACY_DIR, os.path.basename(fpath))
            # Skip files not under version control
            result = subprocess.run(
                ["git", "ls-files", "--error-unmatch", fpath],
                capture_output=True,
            )
            if result.returncode != 0:
                print(f"  Skipping {os.path.basename(fpath)} (not under version control)")
                continue
            subprocess.run(["git", "mv", fpath, dest], check=True)
            moved.append((os.path.basename(fpath), staking_addr, chain_id))
            print(f"  Moved {os.path.basename(fpath)}  ({staking_addr} on chain {chain_id})")

    print(f"\nTotal files moved: {len(moved)}")
    return moved


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if not ETHERSCAN_API_KEY:
        raise RuntimeError("Set the ETHERSCAN_API_KEY environment variable")

    w3 = Web3(Web3.HTTPProvider("https://0xrpc.io/eth"))
    if not w3.is_connected():
        raise RuntimeError("Cannot connect to Ethereum RPC")

    removed_nominees = fetch_removed_nominees(w3)

    # Print summary of removed nominees
    print("\nRemoved nominees:")
    print(f"{'Address':<44} {'ChainId'}")
    print("-" * 54)
    for addr, cid in sorted(removed_nominees, key=lambda x: (x[1], x[0])):
        print(f"{addr:<44} {cid}")

    move_matching_globals(removed_nominees)


if __name__ == "__main__":
    main()
