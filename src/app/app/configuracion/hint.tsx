type HintProps = { text: string };

export function Hint({ text }: HintProps) {
  return <span className="setting-hint" tabIndex={0} aria-label={text}>?<span role="tooltip">{text}</span></span>;
}
