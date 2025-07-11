#!/bin/bash

# Get globals file
globals="$(dirname "$0")/globals_$1.json"
if [ ! -f $globals ]; then
  echo "!!! $globals is not found"
  exit 0
fi

# Read variables using jq
contractVerification=$(jq -r '.contractVerification' $globals)
useLedger=$(jq -r '.useLedger' $globals)
derivationPath=$(jq -r '.derivationPath' $globals)
gasPriceInGwei=$(jq -r '.gasPriceInGwei' $globals)
chainId=$(jq -r '.chainId' $globals)
networkURL=$(jq -r '.networkURL' $globals)

registryTrackerAddress=$(jq -r '.registryTrackerAddress' $globals)
rewardPeriod=$(jq -r '.rewardPeriod' $globals)

# Check for Polygon keys only since on other networks those are not needed
if [ $chainId == 137 ]; then
  API_KEY=$ALCHEMY_API_KEY_MATIC
  if [ "$API_KEY" == "" ]; then
      echo "set ALCHEMY_API_KEY_MATIC env variable"
      exit 0
  fi
elif [ $chainId == 80002 ]; then
    API_KEY=$ALCHEMY_API_KEY_AMOY
    if [ "$API_KEY" == "" ]; then
        echo "set ALCHEMY_API_KEY_AMOY env variable"
        exit 0
    fi
fi

proxyData=$(cast calldata "initialize(uint256)" $rewardPeriod)
contractPath="contracts/registry_tracker/RegistryTrackerProxy.sol:RegistryTrackerProxy"
constructorArgs="$registryTrackerAddress $proxyData"
contractArgs="$contractPath --constructor-args $constructorArgs"


# Get deployer based on the ledger flag
if [ "$useLedger" == "true" ]; then
  walletArgs="-l --mnemonic-derivation-path $derivationPath"
  deployer=$(cast wallet address $walletArgs)
else
  echo "Using PRIVATE_KEY: ${PRIVATE_KEY:0:6}..."
  walletArgs="--private-key $PRIVATE_KEY"
  deployer=$(cast wallet address $walletArgs)
fi

# Deployment message
echo "Deploying from: $deployer"
echo "Deployment of: $contractArgs"

# Deploy the contract and capture the address
execCmd="forge create --broadcast --rpc-url $networkURL$API_KEY $walletArgs $contractArgs"
deploymentOutput=$($execCmd)
registryTrackerProxyAddress=$(echo "$deploymentOutput" | grep 'Deployed to:' | awk '{print $3}')

# Get output length
outputLength=${#registryTrackerProxyAddress}

# Check for the deployed address
if [ $outputLength != 42 ]; then
  echo "!!! The contract was not deployed"
  exit 0
fi

# Write new deployed contract back into JSON
echo "$(jq '. += {"registryTrackerProxyAddress":"'$registryTrackerProxyAddress'"}' $globals)" > $globals

# Verify contract
if [ "$contractVerification" == "true" ]; then
  contractParams="$registryTrackerProxyAddress $contractPath --constructor-args $(cast abi-encode "constructor(address,bytes)" $constructorArgs)"

  echo "Verifying contract on Etherscan..."
  forge verify-contract --chain-id "$chainId" --etherscan-api-key "$ETHERSCAN_API_KEY" $contractParams

  blockscoutURL=$(jq -r '.blockscoutURL' $globals)
  if [ "$blockscoutURL" != "null" ]; then
    echo "Verifying contract on Blockscout..."
    forge verify-contract --verifier blockscout --verifier-url "$blockscoutURL/api" $contractParams
  fi
fi

echo "Recovery Module deployed at: $registryTrackerProxyAddress"