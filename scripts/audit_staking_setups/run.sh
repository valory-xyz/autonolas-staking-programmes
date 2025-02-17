#!/bin/bash

# Scripts path
TARGET_DIR="scripts/deployment"
outfile="$PWD/scripts/audit_staking_setups/files.txt"
#rm $outfile
touch $outfile
truncate -s 0 $outfile

# Check the path existence
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Directory $TARGET_DIR does not exist."
  exit 1
fi

# Traverse all the .json files
for file in "$TARGET_DIR"/*mainnet*.json; do
  if grep -q "stakingTokenInstanceAddress" "$file"; then
    echo $file >> $outfile
  fi
done