import Markdown from 'react-markdown'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { MethodDoc } from '../api/types'
import { AsyncSection } from '../components/States'
import { useAsync } from '../lib/useAsync'

export function MethodPage() {
  const state = useAsync<MethodDoc>(() => api.getMethod(), [])
  return (
    <div className="page">
      <header className="page-head">
        <h1>Method</h1>
      </header>
      <Link to="/method/kelly" className="card deep-dive">
        <div>
          <div className="deep-dive-title">Deep dive: the Kelly formula, term by term</div>
          <div className="deep-dive-sub">The formula up top, tap any symbol for what it means here — plus a calculator to try your own numbers.</div>
        </div>
        <span className="deep-dive-arrow" aria-hidden="true">&rarr;</span>
      </Link>
      <AsyncSection state={state}>
        {(doc) => (
          <article className="card prose">
            <Markdown>{doc.markdown}</Markdown>
          </article>
        )}
      </AsyncSection>
    </div>
  )
}
