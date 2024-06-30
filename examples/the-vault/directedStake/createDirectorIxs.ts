import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { findDirectorAddress } from './directedStake';
import { DirectedStake, directedStakeIdl } from './directedStakeIdl';
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/esm/nodewallet';

export async function createDirectorIxs(authority: PublicKey, target: PublicKey) : Promise<TransactionInstruction[]> {
  const connection = new web3.Connection(process.env.RPC_URL!);
  const wallet = new NodeWallet(web3.Keypair.generate());
  const provider = new AnchorProvider(connection, wallet);
  const program = new Program(directedStakeIdl as unknown as DirectedStake, provider);
  const squadsDirectorAddress = findDirectorAddress(authority);
  const squadsDirectorData = await program.account.director.fetch(squadsDirectorAddress);

  const isUpdatingExisting = !!squadsDirectorData.stakeTarget;

  const instructions: TransactionInstruction[] = [];

  if (!isUpdatingExisting)
    instructions.push(
      await program.methods
        .initDirector()
        .accounts({
          authority,
          payer: authority,
        })
        .instruction(),
    );

  instructions.push(
    await program.methods
      .setStakeTarget()
      .accounts({
        authority,
        stakeTarget: target,
      })
      .instruction(),
  );

  return instructions;
}
