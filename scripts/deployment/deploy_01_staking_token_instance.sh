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
chainId=$(jq -r '.chainId' $globals)
networkURL=$(jq -r '.networkURL' $globals)

# Check for Alchemy keys on ETH, Polygon mainnets and testnets
if [[ "$networkURL" == *"alchemy.com"* ]]; then
  case $chainId in
    1)        API_KEY=$ALCHEMY_API_KEY_MAINNET; keyName="ALCHEMY_API_KEY_MAINNET" ;;
    11155111) API_KEY=$ALCHEMY_API_KEY_SEPOLIA; keyName="ALCHEMY_API_KEY_SEPOLIA" ;;
    137)      API_KEY=$ALCHEMY_API_KEY_MATIC;   keyName="ALCHEMY_API_KEY_MATIC" ;;
    80002)    API_KEY=$ALCHEMY_API_KEY_AMOY;    keyName="ALCHEMY_API_KEY_AMOY" ;;
  esac
  if [ -n "$keyName" ] && [ "$API_KEY" == "" ]; then
    echo "${red}!!! Set $keyName env variable${reset}"
    exit 0
  fi
fi

serviceRegistryTokenUtilityAddress=$(jq -r '.serviceRegistryTokenUtilityAddress' $globals)
olasAddress=$(jq -r '.olasAddress' $globals)
stakingTokenAddress=$(jq -r '.stakingTokenAddress' $globals)
stakingFactoryAddress=$(jq -r '.stakingFactoryAddress' $globals)

# Read staking params
metadataHash=$(jq -r '.stakingParams.metadataHash' $globals)
maxNumServices=$(jq -r '.stakingParams.maxNumServices' $globals)
rewardsPerSecond=$(jq -r '.stakingParams.rewardsPerSecond' $globals)
minStakingDeposit=$(jq -r '.stakingParams.minStakingDeposit' $globals)
minNumStakingPeriods=$(jq -r '.stakingParams.minNumStakingPeriods' $globals)
maxNumInactivityPeriods=$(jq -r '.stakingParams.maxNumInactivityPeriods' $globals)
livenessPeriod=$(jq -r '.stakingParams.livenessPeriod' $globals)
timeForEmissions=$(jq -r '.stakingParams.timeForEmissions' $globals)
numAgentInstances=$(jq -r '.stakingParams.numAgentInstances' $globals)
threshold=$(jq -r '.stakingParams.threshold' $globals)
configHash=$(jq -r '.stakingParams.configHash' $globals)
proxyHash=$(jq -r '.stakingParams.proxyHash' $globals)
serviceRegistry=$(jq -r '.stakingParams.serviceRegistry' $globals)
activityChecker=$(jq -r '.stakingParams.activityChecker' $globals)

# Build agentIds as a cast-compatible array
agentIds=$(jq -r '.stakingParams.agentIds | "[" + join(",") + "]"' $globals)

# Encode the initialize function call for StakingToken
# initialize((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256[],uint256,bytes32,bytes32,address,address),address,address)
initPayload=$(cast calldata "initialize((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256[],uint256,bytes32,bytes32,address,address),address,address)" "($metadataHash,$maxNumServices,$rewardsPerSecond,$minStakingDeposit,$minNumStakingPeriods,$maxNumInactivityPeriods,$livenessPeriod,$timeForEmissions,$numAgentInstances,$agentIds,$threshold,$configHash,$proxyHash,$serviceRegistry,$activityChecker)" "$serviceRegistryTokenUtilityAddress" "$olasAddress")

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
echo "Deploying StakingTokenInstance via StakingFactory"

# Call createStakingInstance on the factory
execCmd="cast send --rpc-url $networkURL$API_KEY $walletArgs $stakingFactoryAddress \"createStakingInstance(address,bytes)\" $stakingTokenAddress $initPayload"
txOutput=$(eval $execCmd)

# Get the transaction hash
txHash=$(echo "$txOutput" | grep 'transactionHash' | awk '{print $2}')

# Get staking contract instance address from the event log (InstanceCreated topic[2])
stakingTokenInstanceAddress=$(cast receipt --rpc-url "$networkURL$API_KEY" "$txHash" --json | jq -r '.logs[0].topics[2]' | sed 's/0x000000000000000000000000/0x/')

# Get output length
outputLength=${#stakingTokenInstanceAddress}

# Check for the deployed address
if [ $outputLength != 42 ]; then
  echo "!!! The contract was not deployed"
  exit 0
fi

# Write new deployed contract back into JSON
echo "$(jq '. += {"stakingTokenInstanceAddress":"'$stakingTokenInstanceAddress'"}' $globals)" > $globals

echo "StakingTokenInstance deployed at: $stakingTokenInstanceAddress"
