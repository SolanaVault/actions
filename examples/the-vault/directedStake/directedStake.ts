import { PublicKey } from '@solana/web3.js';
import { directedStakeIdl } from './directedStakeIdl';

const DIRECTED_STAKE_PROGRAM_ID = new PublicKey(directedStakeIdl.address);

export function findDirectorAddress(authority: PublicKey) {
  const [key] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('director'), authority.toBytes()],
    DIRECTED_STAKE_PROGRAM_ID,
  );
  return key;
}
