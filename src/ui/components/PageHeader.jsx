/** Index · Title · one primary action, separated from content by a heavy rule. */
export default function PageHeader({ index, eyebrow, title, lede, action }) {
  return (
    <header className="page-head">
      <div className="page-head__meta mono">
        <span>{index}</span>
        <span>{eyebrow}</span>
      </div>
      <div className="page-head__row">
        <div>
          <h1 className="page-head__title">{title}</h1>
          {lede && <p className="page-head__lede">{lede}</p>}
        </div>
        {action && <div className="page-head__action">{action}</div>}
      </div>
    </header>
  )
}
