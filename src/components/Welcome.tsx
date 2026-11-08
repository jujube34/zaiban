import { ArrowRight, FileText, Folder, Loader2 } from 'lucide-react'
import { Brand } from './Brand'

interface WelcomeProps {
  supported: boolean
  storedName: string | null
  busy: boolean
  onChoose: () => void
  onResume: () => void
}

export function Welcome({ supported, storedName, busy, onChoose, onResume }: WelcomeProps) {
  return (
    <div className="welcome">
      <header className="welcome__header">
        <Brand />
      </header>

      <main className="welcome__main">
        <section className="welcome__copy">
          <h1 className="welcome__title">
            把正在做的事，
            <br />
            <span>放在一处。</span>
          </h1>

          {supported ? (
            <div className="welcome__actions">
              {storedName ? (
                <>
                  <button
                    type="button"
                    className="button button--primary button--large"
                    onClick={onResume}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="spin" size={18} /> : <Folder size={18} strokeWidth={1.8} />}
                    <span>继续使用「{storedName}」</span>
                    {!busy && <ArrowRight size={17} className="button__arrow" />}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--large"
                    onClick={onChoose}
                    disabled={busy}
                  >
                    选择其他目录
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--primary button--large"
                  onClick={onChoose}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="spin" size={18} /> : <Folder size={18} strokeWidth={1.8} />}
                  <span>选择工作目录</span>
                  {!busy && <ArrowRight size={17} className="button__arrow" />}
                </button>
              )}
            </div>
          ) : (
            <div className="browser-notice" role="alert">
              <strong>当前浏览器不支持本地文件夹访问</strong>
              <p>请使用最新版 Chrome 或 Edge 打开在办。Windows、macOS 与 Android 均可使用。</p>
            </div>
          )}
        </section>

        <div className="welcome__visual" aria-hidden="true">
          <div className="visual-glow" />
          <div className="visual-ring visual-ring--one" />
          <div className="visual-ring visual-ring--two" />

          <div className="visual-folder">
            <div className="visual-folder__tab" />
            <div className="visual-folder__back" />
            <div className="visual-folder__paper">
              <span className="visual-folder__index">03 / IN PROGRESS</span>
              <span className="visual-folder__title">正在发生的事</span>
              <span className="visual-folder__rule visual-folder__rule--long" />
              <span className="visual-folder__rule" />
              <span className="visual-folder__rule visual-folder__rule--short" />
              <span className="visual-folder__stamp">持续记录</span>
            </div>
            <div className="visual-folder__front" />
          </div>

          <div className="visual-note">
            <div className="visual-note__head">
              <span className="visual-note__dot" />
              <span>进展笔记</span>
              <span className="visual-note__time">刚刚</span>
            </div>
            <p>今天的推进已记下，思路还在继续。</p>
            <div className="visual-note__lines">
              <span />
              <span />
            </div>
          </div>

          <div className="visual-file">
            <FileText size={15} strokeWidth={1.7} />
            <span>方案要点.pdf</span>
          </div>
        </div>
      </main>

      <footer className="welcome__footer">
        <span className="welcome__support">支持最新版 Chrome / Edge</span>
      </footer>
    </div>
  )
}
