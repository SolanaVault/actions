import { Connection, ParsedAccountData, PublicKey } from '@solana/web3.js';
// comes from `solana validator-info get --output json-compact | pbcopy`
import validatorInfo from './cliValidatorInfo.json';
// comes from `solana validators --output json|pbcopy`
import validators from './cliValidators.json';

import { stakePoolInfo } from '@solana/spl-stake-pool';

export type ValidatorInfo = {
  moniker: string;
  pictureURL: string | null;
  identityPubkey: string | null;
};

export const getValidatorInfoFromIdentityPubkey = (
  identityPubkey: PublicKey,
): ValidatorInfo | undefined => {
  // const validator = validators.find(
  //     (v) => v.votePubkey === votePubkey.toString(),
  // );
  const info = validatorInfo.find(
    (v: any) => v.identityPubkey === identityPubkey.toString(),
  );
  if (!info) {
    return undefined;
  }
  return {
    moniker: info?.info.name ?? identityPubkey.toString(),
    pictureURL:
      info?.info.iconUrl ??
      (info?.info.keybaseUsername
        ? `https://keybase.io/${info.info.keybaseUsername}/picture?format=square_40`
        : null) ??
      null,
    identityPubkey: info?.identityPubkey ?? null,
  };
};

export const getValidatorInfoFromVotePubkey = (
  votePubkey: PublicKey,
): ValidatorInfo | undefined => {
  // Find the current validator info
  const currentValidatorIdentityPubkey = validators.validators.find((v: any) =>
    new PublicKey(v.voteAccountPubkey).equals(votePubkey),
  )?.identityPubkey;

  if (!currentValidatorIdentityPubkey) return undefined;

  return getValidatorInfoFromIdentityPubkey(
    new PublicKey(currentValidatorIdentityPubkey),
  );
};

function listToDict<T>(
  list: T[],
  idGen: (arg: T) => string,
): { [key: string]: T } {
  const dict: { [key: string]: T } = {};

  list.forEach((element) => {
    const dictKey = idGen(element);
    dict[dictKey] = element;
  });

  return dict;
}

async function getAllValidators(connection: Connection) {
  let validatorAccounts = await connection.getParsedProgramAccounts(
    new PublicKey('Config1111111111111111111111111111111111111'),
  );

  const voteAccounts = await connection.getVoteAccounts();
  const voteAccountsByIdentity = listToDict(
    [...voteAccounts.current, ...voteAccounts.delinquent],
    (v) => v.nodePubkey,
  );

  // Filter
  validatorAccounts = validatorAccounts.filter((validatorAccount) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const data: any = validatorAccount.account.data;

    if (
      !data ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !data['parsed'] ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !data['parsed']['info'] ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !data['parsed']['info']['configData'] ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !data['parsed']['info']['keys']
    )
      return false;

    return true;
  });

  // Map to dictionary so that we get rid of duplicates
  const validatorAccountsDict = listToDict(
    validatorAccounts,
    (validator_account) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      (validator_account.account.data as ParsedAccountData).parsed[
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        'info'
        ]['keys'][1]['pubkey'],
  );

  return Object.values(validatorAccountsDict).map((validatorAccount) => {
    const data = validatorAccount.account.data as ParsedAccountData;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const info: {
      name: string;
      details: string;
      website: string;
      iconUrl: string;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    } = data.parsed['info']['configData'];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const keys: { pubkey: string }[] = data.parsed['info']['keys'];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const identityPubkey: string =
      keys && keys.length > 1 && keys[1] ? keys[1].pubkey : '';

    const votePubkey = voteAccountsByIdentity[identityPubkey].votePubkey;

    console.log(identityPubkey, votePubkey);

    return {
      identityPubKey: identityPubkey,
      votePubKey: votePubkey,
      name: info.name,
      iconUrl: info.iconUrl,
      website: info.website,
      details: info.details,
    };
  });
}

export const getAvailableValidators = async (): Promise<ValidatorInfo[]> => {
  const connection = new Connection(process.env.RPC_URL!);
  const allValidators = await getAllValidators(connection);

  console.log(`allValidators: ${allValidators.length}`);

  const poolInfo = await stakePoolInfo(connection, new PublicKey(process.env.STAKE_POOL_ADDRESS!));

  console.log(allValidators[0]);
  console.log(poolInfo.validatorList[0]);

  return allValidators
    .filter((validator) => {
      return (
        poolInfo.validatorList.find(
          (v) => v.voteAccountAddress === validator.votePubKey,
        ) !== undefined
      );
    })
    .map((info) => {
      return {
        moniker: info.name ?? info.votePubKey,
        pictureURL: info.iconUrl,
        identityPubkey: info.identityPubKey,
      };
    });
};
