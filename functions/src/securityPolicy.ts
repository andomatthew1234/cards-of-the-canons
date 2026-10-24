export type StoredSecurityPolicy = {
  version: 1
  methods: {
    emailCode: { status: 'not_configured' | 'enabled'; verifiedAt: string | null }
    authenticator: { status: 'not_configured' | 'enabled'; verifiedAt: string | null }
    passkey: { status: 'not_configured' | 'enabled'; verifiedAt: string | null }
  }
  requirements: {
    signIn: boolean
    criticalActions: boolean
    paymentActions: boolean
    passwordlessSignIn: boolean
  }
}

export const defaultSecurityPolicy: StoredSecurityPolicy = {
  version: 1,
  methods: {
    emailCode: { status: 'not_configured', verifiedAt: null },
    authenticator: { status: 'not_configured', verifiedAt: null },
    passkey: { status: 'not_configured', verifiedAt: null },
  },
  requirements: {
    signIn: false,
    criticalActions: false,
    paymentActions: false,
    passwordlessSignIn: false,
  },
}

function status(value: unknown): 'not_configured' | 'enabled' {
  return value === 'enabled' ? 'enabled' : 'not_configured'
}

// A requirement is only reported when its supporting capability is actually
// configured. Claiming an unenforceable requirement would promise protection
// the service cannot deliver, so unsupported requirements are removed from
// the normalised policy instead of being surfaced as if they were active.
const requirementSupported: Record<keyof StoredSecurityPolicy['requirements'], boolean> = {
  signIn: false,
  criticalActions: false,
  paymentActions: false,
  passwordlessSignIn: false,
}

function verifiedAt(value: unknown) {
  if (typeof value === 'string' && value.length <= 40) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return null
}

export function normaliseSecurityPolicy(value: unknown): StoredSecurityPolicy {
  if (!value || typeof value !== 'object') return structuredClone(defaultSecurityPolicy)
  const data = value as Record<string, unknown>
  const methods = data.methods && typeof data.methods === 'object' ? data.methods as Record<string, unknown> : {}
  const requirements = data.requirements && typeof data.requirements === 'object' ? data.requirements as Record<string, unknown> : {}
  const method = (name: string) => methods[name] && typeof methods[name] === 'object' ? methods[name] as Record<string, unknown> : {}
  const emailCode = method('emailCode')
  const authenticator = method('authenticator')
  const passkey = method('passkey')
  return {
    version: 1,
    methods: {
      emailCode: { status: status(emailCode.status), verifiedAt: verifiedAt(emailCode.verifiedAt) },
      authenticator: { status: status(authenticator.status), verifiedAt: verifiedAt(authenticator.verifiedAt) },
      passkey: { status: status(passkey.status), verifiedAt: verifiedAt(passkey.verifiedAt) },
    },
    requirements: {
      signIn: requirements.signIn === true && requirementSupported.signIn,
      criticalActions: requirements.criticalActions === true && requirementSupported.criticalActions,
      paymentActions: requirements.paymentActions === true && requirementSupported.paymentActions,
      passwordlessSignIn: requirements.passwordlessSignIn === true && requirementSupported.passwordlessSignIn,
    },
  }
}

export const securityCapabilities = {
  emailCodeDelivery: false,
  passwordlessEmailCode: false,
  authenticator: false,
  passkeys: false,
  explanation: 'Secure email-code delivery is not configured for this site yet.',
} as const
