# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.6.2-pre-internal-audit` or `91a750f7665c9975c6d948497d76573f96b2f3ca` <br> 

## Objectives
The audit focused on contracts in this repo. <br>

### ERC20/ERC721 checks
N/A

### Security issues. 
### Notes/Medium issue. mapActiveMutisigAttestations the correct tx origin is unknown.
```
    function attestByDelegation(IEAS.DelegatedAttestationRequest calldata delegatedRequest) external payable returns (bytes32) {
        // Upper bits are untouched, so it is safe to just increase the amount of attestations
        mapActiveMutisigAttestations[msg.sender]++;
    vs
        mapActiveMutisigAttestations[delegatedRequest.attester]++;
    or both.
    Please, contact with BIO protocol.
```
[]

### Notes/Question. Order in using mapActiveMutisigAttestations[multisig]
```
Clear counter:
mapActiveMutisigAttestations[multisig] = 1 << 255; - Erases all bits except the most significant one

Safe counter:
mapActiveMutisigAttestations[multisig] |= 1 << 255; - Sets only the high bit but leaves the low bits alone.
```
[x] The later is used - the counter is not reset






