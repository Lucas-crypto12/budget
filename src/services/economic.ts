import axios, { AxiosInstance } from 'axios'

const BASE_URL = 'https://restapi.e-conomic.com'

export interface VoucherPayload {
  date: string           // YYYY-MM-DD
  accountNumber: number
  contraAccountNumber: number
  amount: number
  currency: string
  vatCode?: string
  text: string
}

export interface VoucherResponse {
  voucherNumber: number
  journalNumber: number
  date: string
  accountNumber: number
  amount: number
  [key: string]: unknown
}

export class EconomicService {
  private readonly client: AxiosInstance

  constructor(
    private readonly appSecretToken: string,
    private readonly agreementGrantToken: string
  ) {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'X-AppSecretToken': appSecretToken,
        'X-AgreementGrantToken': agreementGrantToken,
        'Content-Type': 'application/json',
      },
    })
  }

  async createVoucher(journalNumber: number, payload: VoucherPayload): Promise<VoucherResponse> {
    const response = await this.client.post<VoucherResponse>(
      `/journals/${journalNumber}/vouchers`,
      payload
    )
    return response.data
  }

  async getJournal(journalNumber: number) {
    const response = await this.client.get(`/journals/${journalNumber}`)
    return response.data
  }

  async getAccounts() {
    const response = await this.client.get('/accounts?pagesize=200')
    return response.data
  }
}
