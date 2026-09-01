import Markdown from 'react-markdown'
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
