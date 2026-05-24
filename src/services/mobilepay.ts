import axios from 'axios'

const BASE_URL = 'https://api.vipps.no'

export interface MobilePayTransaction {
  pspReference: string
  reference: string | null
  time: string
  ledgerDate: string
  entryType: string
  amount: number  // minor units (øre): DKK 100 = 10000
  currency: string
  message: string | null
  name: string | null
  balanceBefore: number
  balanceAfter: number
}

interface AccessTokenResponse {
  access_token: string
  expires_in: string
  token_type: string
}

export class MobilePayService {
  private accessToken: string | null = null
  private tokenExpiresAt: Date | null = null

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly subscriptionKey: string,
    private readonly merchantSerialNumber: string
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken
    }

    const response = await axios.post<AccessTokenResponse>(
      `${BASE_URL}/accesstoken/get`,
      {},
      {
        headers: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        },
      }
    )

    this.accessToken = response.data.access_token
    // Subtract 60s to refresh before actual expiry
    this.tokenExpiresAt = new Date(Date.now() + parseInt(response.data.expires_in) * 1000 - 60_000)
    return this.accessToken
  }

  async fetchTransactions(
    startDate: string,  // YYYY-MM-DD
    endDate: string,    // YYYY-MM-DD
    ledgerType: 'funds' | 'fees' = 'funds'
  ): Promise<MobilePayTransaction[]> {
    const token = await this.getAccessToken()
    const all: MobilePayTransaction[] = []
    let cursor: string | undefined

    do {
      const params: Record<string, string> = { startDate, endDate }
      if (cursor) params.cursor = cursor

      const response = await axios.get<{ items: MobilePayTransaction[]; cursor?: string }>(
        `${BASE_URL}/report/v2/ledger/${ledgerType}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Merchant-Serial-Number': this.merchantSerialNumber,
          },
          params,
        }
      )

      all.push(...response.data.items)
      cursor = response.data.cursor
    } while (cursor)

    return all
  }
}
