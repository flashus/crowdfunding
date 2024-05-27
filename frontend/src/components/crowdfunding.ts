/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/crowdfunding.json`.
 */
export type Crowdfunding = {
  "address": "6HpyohHGRewtg4A3GFnbsBRYXTXVLvSZWtJFKmkZx4QZ",
  "metadata": {
    "name": "crowdfunding",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "contribute",
      "discriminator": [
        82,
        33,
        68,
        131,
        32,
        0,
        205,
        95
      ],
      "accounts": [
        {
          "name": "campaign",
          "writable": true
        },
        {
          "name": "contributor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "arg",
                "path": "urlSeed"
              },
              {
                "kind": "const",
                "value": [
                  67,
                  70,
                  95,
                  83,
                  69,
                  69,
                  68
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "goal",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "url",
          "type": "string"
        },
        {
          "name": "urlSeed",
          "type": "string"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "campaign",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "campaign",
      "discriminator": [
        50,
        40,
        49,
        11,
        157,
        220,
        229,
        192
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "wrongUser",
      "msg": "Wrong user."
    },
    {
      "code": 6001,
      "name": "goalTooLow",
      "msg": "The goal is too low."
    },
    {
      "code": 6002,
      "name": "deadlineTooLow",
      "msg": "The deadline is too low."
    },
    {
      "code": 6003,
      "name": "urlTooLong",
      "msg": "URL too long."
    },
    {
      "code": 6004,
      "name": "campaignEnded",
      "msg": "The campaign has ended."
    },
    {
      "code": 6005,
      "name": "campaignStillActive",
      "msg": "The campaign is still active."
    },
    {
      "code": 6006,
      "name": "goalNotReached",
      "msg": "The goal has not been reached."
    }
  ],
  "types": [
    {
      "name": "campaign",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "url",
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          },
          {
            "name": "goal",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "raisedAmount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
