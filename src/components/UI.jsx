import { useEffect, useRef } from 'react';
import { AlertCircle, Check, ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react';

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={17} /></button>;
}

export function Button({ children, icon: Icon, busy, variant = 'primary', className = '', ...props }) {
  return <button type="button" className={`button button-${variant} ${className}`} disabled={busy || props.disabled} {...props}>{busy ? <LoaderCircle size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}{children}</button>;
}

export function Empty({ icon: Icon, title, description, action }) {
  return <div className="empty-state">{Icon && <span className="empty-icon"><Icon size={27} strokeWidth={1.5} /></span>}<h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function PageHeader({ title, description, children, eyebrow }) {
  return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="header-actions">{children}</div></header>;
}

export function SearchInput({ value, onChange, placeholder = '搜索', ...props }) {
  return <label className="search-input"><Search size={16} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} {...props} />{value && <IconButton icon={X} label="清除搜索" onClick={() => onChange('')} />}</label>;
}

export function Modal({ title, description, children, onClose, wide = false }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    function keydown(event) {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll('button:not([disabled]), input, textarea, select, a[href], [tabindex="0"]');
        if (!nodes?.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'modal-wide' : ''}`}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton icon={X} label="关闭" onClick={onClose} /></header>{children}</section></div>;
}

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Toggle({ checked, onChange, label, disabled }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}

const STATUS = { idle: ['待开始', 'muted'], running: ['执行中', 'blue'], awaiting_approval: ['等待审批', 'amber'], completed: ['已完成', 'green'], failed: ['失败', 'red'], stopped: ['已停止', 'muted'], ready: ['可使用', 'green'], needs_configuration: ['待配置', 'amber'], external: ['需外部服务', 'muted'], connected: ['已连接', 'green'], disconnected: ['未连接', 'muted'], error: ['连接失败', 'red'] };
export function Status({ value, text }) {
  const [label, tone] = STATUS[value] || [value || '待配置', 'muted'];
  return <span className={`status status-${tone}`}><span className="status-dot" />{text || label}</span>;
}

export function InlineError({ children }) {
  return children ? <div className="inline-error" role="alert"><AlertCircle size={16} /><span>{children}</span></div> : null;
}

export function Toast({ message, onClose }) {
  useEffect(() => { if (!message) return; const id = setTimeout(onClose, 4500); return () => clearTimeout(id); }, [message, onClose]);
  return message ? <div className="toast" role="status"><Check size={17} /><span>{message}</span><IconButton label="关闭提示" icon={X} onClick={onClose} /></div> : null;
}

export function Select({ children, className = '', ...props }) {
  return <span className={`select-wrap ${className}`}><select {...props}>{children}</select><ChevronDown size={13} /></span>;
}

export function AddButton({ children = '新建', ...props }) { return <Button icon={Plus} {...props}>{children}</Button>; }
