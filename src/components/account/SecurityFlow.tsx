import { ArrowLeft, Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AccountCentreShell } from './AccountChrome'

export interface FlowStep { number: string; label: string }

export function SecurityFlow({ title, eyebrow, steps, activeStep, children, onBack }: { title: string; eyebrow: string; steps: FlowStep[]; activeStep: number; children: ReactNode; onBack?: () => void }) {
  const managementFlow = title.toLowerCase().includes('delete')
  const backTo = managementFlow ? '/account/manage' : '/account/security'
  const backLabel = managementFlow ? 'Back to account management' : 'Back to security & sign-in'
  return <AccountCentreShell title={title} eyebrow={eyebrow} description={managementFlow ? 'Complete this permanent account action through the protected guided process.' : 'Complete this security change through the protected guided process.'}>
    <div className="security-flow-page account-embedded-flow">
      <div className="security-flow-toolbar">{onBack ? <button className="security-flow-back" onClick={onBack}><ArrowLeft aria-hidden="true" /> {backLabel}</button> : <Link className="security-flow-back" to={backTo}><ArrowLeft aria-hidden="true" /> {backLabel}</Link>}</div>
      <div className="security-flow-layout">
        <ol className="security-stepper" aria-label="Progress">
          {steps.map((step, index) => <li key={step.number} className={index + 1 === activeStep ? 'active' : index + 1 < activeStep ? 'complete' : ''} aria-current={index + 1 === activeStep ? 'step' : undefined}><span>{index + 1 < activeStep ? <Check aria-hidden="true" /> : step.number}</span><strong>{step.label}</strong></li>)}
        </ol>
        <main className="security-flow-content"><div key={activeStep} className="security-flow-transition">{children}</div></main>
      </div>
    </div>
  </AccountCentreShell>
}
