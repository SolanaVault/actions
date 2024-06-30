import {
  LAMPORTS_PER_SOL, MessageV0,
  PublicKey,
  SystemProgram, TransactionInstruction, TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../openapi';
import {
  ActionError,
  ActionsSpecGetResponse,
  ActionsSpecPostRequestBody,
  ActionsSpecPostResponse,
} from '../../spec/actions-spec';
import { connection, prepareTransaction } from '../transaction-utils';
import { depositSol } from '@solana/spl-stake-pool';
import { getValidatorInfoFromIdentityPubkey, getValidatorInfoFromVotePubkey } from './directedStake/validatorInfo';
import { createDirectorIxs } from './directedStake/createDirectorIxs';

const STAKE_POOL = 'Fu9BYC6tWBo1KMKaP3CFoKfRhqv9akmy3DuYwnCyWiyC';
const DEFAULT_STAKE_AMOUNT = '1';
const DEFAULT_STAKE_AMOUNT_OPTIONS = ['1', '5', '10'];

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Stake'],
    responses: actionsSpecOpenApiGetResponse,
  }),
  (c) => {
    const { icon, title, description } = getStakeInfo();
    const amountParameterName = 'amount';
    const response: ActionsSpecGetResponse = {
      icon,
      label: `${DEFAULT_STAKE_AMOUNT} SOL`,
      title: title,
      description,
      links: {
        actions: [
          ...DEFAULT_STAKE_AMOUNT_OPTIONS.map((amount) => ({
            label: `${amount} SOL`,
            href: `/api/stake/${amount}`,
          })),
          {
            href: `/api/stake/{${amountParameterName}}`,
            label: `Stake`,
            parameters: [
              {
                name: amountParameterName,
                label: 'Enter a custom SOL amount',
              },
            ],
          },
        ],
      },
    };

    return c.json(response, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/directed/{target}',
    tags: ['Directed'],
    request: {
      params: z.object({
        target: z.string().openapi({
          param: {
            name: 'target',
            in: 'path',
          },
          type: 'string',
          example: '7Hp1e6BrTBkbBN4wFiNmycPVPsjvyUUBL2tGhYEMT6gt',
        }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  (c) => {
    const { icon, title, description } = getStakeInfo();
    const target = c.req.param('target');
    console.log('target', target);
    if(!target) {
      const errorResponse: ActionError = {
        message: 'Enter a valid target',
      };
      return c.json(errorResponse, 422);
    }
    let directKey = undefined;
    try {
      directKey = new PublicKey(target);
    } catch (error) {
      const errorResponse: ActionError = {
        message: 'direct query string must be a valid base58 public key',
      };
      return c.json(errorResponse, 422);
    }
    const info = getValidatorInfoFromIdentityPubkey(directKey);
    if (!info) {
      const errorResponse: ActionError = {
        message: 'Unable to find validator info for the provided public key',
      };
      return c.json(errorResponse, 422);
    }
    let directTitle = undefined;
    if (info.moniker) {
      directTitle = `Stake to The Vault - directed to ${info?.moniker}`;
    }
    const amountParameterName = 'amount';
    const response: ActionsSpecGetResponse = {
      icon,
      label: `${DEFAULT_STAKE_AMOUNT} SOL`,
      title: directTitle ?? title,
      description,
      links: {
        actions: [
          ...DEFAULT_STAKE_AMOUNT_OPTIONS.map((amount) => ({
            label: `${amount} SOL`,
            href: `/api/stake/directed/${target}/${amount}`,
          })),
          {
            href: `/api/stake/directed/${target}/{${amountParameterName}}`,
            label: `Stake`,
            parameters: [
              {
                name: amountParameterName,
                label: 'Enter a custom SOL amount',
              },
            ],
          },
        ],
      },
    };
    return c.json(response, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{amount}',
    tags: ['Stake'],
    request: {
      params: z.object({
        amount: z.string().openapi({
          param: {
            name: 'amount',
            in: 'path',
          },
          type: 'number',
          example: '1',
        }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  (c) => {
    const amount = c.req.param('amount');
    const { icon, title, description } = getStakeInfo();
    const response: ActionsSpecGetResponse = {
      icon,
      label: `${amount} SOL`,
      title,
      description,
    };
    return c.json(response, 200);
  },
);


app.openapi(
  createRoute({
    method: 'post',
    path: '/{amount}',
    tags: ['Stake'],
    request: {
      params: z.object({
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'amount',
              in: 'path',
              required: false,
            },
            type: 'number',
            example: '1',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }),
  async (c) => {
    const amount =
      c.req.param('amount') ?? DEFAULT_STAKE_AMOUNT.toString();
    const { account } = (await c.req.json()) as ActionsSpecPostRequestBody;
    const parsedAmount = parseFloat(amount);
    if(parsedAmount <= 0 || isNaN(parsedAmount)) {
      const errorResponse: ActionError = {
        message: 'Enter a valid amount',
      };
      return c.json(errorResponse, 422);
    }
    const payerKey = new PublicKey(account);
    try {
      const transaction = await createTransaction(payerKey, parsedAmount);
      const response: ActionsSpecPostResponse = {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        message: `Staked ${parsedAmount} SOL to The Vault`,
        redirect: "https://thevault.finance/"
      };
      return c.json(response, 200);
    } catch (error: any) {
      const errorResponse: ActionError = {
        message: error.message,
      };
      return c.json(errorResponse, 422);
    }
  });

app.openapi(
  createRoute({
    method: 'post',
    path: '/directed/{target}/{amount}',
    tags: ['Directed'],
    request: {
      params: z.object({
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'amount',
              in: 'path',
              required: false,
            },
            type: 'number',
            example: '1',
          }),
        target: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'target',
              in: 'path',
              required: false,
            },
            type: 'string',
            example: '7Hp1e6BrTBkbBN4wFiNmycPVPsjvyUUBL2tGhYEMT6gt',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }),
  async (c) => {
    const amount =
      c.req.param('amount') ?? DEFAULT_STAKE_AMOUNT.toString();
    const target = c.req.param('target');
    if(!target) {
      const errorResponse: ActionError = {
        message: 'Invalid directed stake target',
      };
      return c.json(errorResponse, 422);
    }
    let targetKey;
    try {
      targetKey = new PublicKey(target);
    } catch (error) {
      const errorResponse: ActionError = {
        message: 'Invalid directed stake target',
      };
      return c.json(errorResponse, 422);
    }
    const info = getValidatorInfoFromIdentityPubkey(targetKey);
    if (!info) {
      const errorResponse: ActionError = {
        message: 'Unable to find validator info for the provided public key',
      };
      return c.json(errorResponse, 422);
    }
    const { account } = (await c.req.json()) as ActionsSpecPostRequestBody;
    const parsedAmount = parseFloat(amount);
    if(parsedAmount <= 0 || isNaN(parsedAmount)) {
      const errorResponse: ActionError = {
        message: 'Enter a valid amount',
      };
      return c.json(errorResponse, 422);
    }
    const payerKey = new PublicKey(account);
    try {
      const { instructions: depositIxs , signers} = await depositSol(
        connection,
        new PublicKey(STAKE_POOL),
        payerKey,
        parsedAmount * LAMPORTS_PER_SOL,
      );

      const directorIxs = await createDirectorIxs(payerKey, new PublicKey(target));
      const { blockhash } = await connection.getLatestBlockhash();
      const txMessage = new TransactionMessage({
        payerKey,
        instructions: [...depositIxs, ...directorIxs],
        recentBlockhash: blockhash,
      });
      const transaction = new VersionedTransaction(txMessage.compileToV0Message());
      const response: ActionsSpecPostResponse = {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        message: `Staked ${parsedAmount} SOL to The Vault - directed to ${info.moniker}`,
        redirect: "https://thevault.finance/"
      };
      return c.json(response, 200);
    } catch (error: any) {
      const errorResponse: ActionError = {
        message: error.message,
      };
      return c.json(errorResponse, 422);
    }
  });



async function createTransaction(payerKey: PublicKey, parsedAmount: number) {
  console.log('RPC', connection.rpcEndpoint)
  const { instructions , signers} = await depositSol(
    connection,
    new PublicKey(STAKE_POOL),
    payerKey,
    parsedAmount * LAMPORTS_PER_SOL,
  );
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey,
    instructions,
    recentBlockhash: blockhash,
  });
  const transaction = new VersionedTransaction(txMessage.compileToV0Message());
  transaction.sign(signers);
  return transaction;
}

function getStakeInfo(): Pick<
  ActionsSpecGetResponse,
  'icon' | 'title' | 'description'
> {
  const icon = 'https://solanavault.s3.amazonaws.com/vSolBanner.webp'
  const title = 'Stake to The Vault';
  const description =
    'The LST of The Vault Finance. The growth focused stake pool.';
  return { icon, title, description };
}

export default app;
