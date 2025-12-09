#!/bin/bash

red=$(tput setaf 1)
green=$(tput setaf 2)
reset=$(tput sgr0)

# Get globals file
globals="$(pwd)/scripts/deployment/globals_base_mainnet_contribute.json"
if [ ! -f $globals ]; then
  echo "${red}!!! $globals is not found${reset}"
  exit 0
fi

bridgeMediatorAddress=$(jq -r ".bridgeMediatorAddress" $globals)
contributorsAddress=$(jq -r ".contributorsAddress" $globals)
contributorsProxyAddress=$(jq -r ".contributorsProxyAddress" $globals)
baseL1CrossDomainMessengerProxyAddress=$(jq -r ".baseL1CrossDomainMessengerProxyAddress" $globals)

# Raw payload for L2 execution
rawPayload=$(cast calldata "changeImplementation(address)" $contributorsAddress)
rawPayloadLength=${#rawPayload}

# Data to be called from bridgeMediator
data=$(cast abi-encode --packed "(address,uint96,uint32,bytes)" $contributorsProxyAddress 0 $rawPayloadLength $rawPayload)
echo "${green}data called by BridgeMediator: $data${reset}"

# Build the bridge payload
messengerPayload=$(cast calldata "processMessageFromSource(bytes)" $data)
minGasLimit="2000000"
# Build the final payload for the Timelock
timelockPayload=$(cast calldata "sendMessage(address,bytes,uint32)" $bridgeMediatorAddress $messengerPayload $minGasLimit);

# Proposal command
echo "${green}Contributors proxy to change Contributors implementation${reset}"
echo "${green}target: $baseL1CrossDomainMessengerProxyAddress${reset}"
echo "${green}payload: $timelockPayload${reset}"
