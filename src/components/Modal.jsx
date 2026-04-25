import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const close = useCallback(() => setModal(null), []);

  const showConfirm = useCallback(({ title, body, onConfirm, confirmText = 'Да', cancelText = 'Отмена', danger = false }) => {
    setModal({ kind: 'confirm', title, body, onConfirm, confirmText, cancelText, danger });
  }, []);

  const showForm = useCallback(({ title, fields, onSubmit, submitText = 'Сохранить' }) => {
    setModal({ kind: 'form', title, fields, onSubmit, submitText });
  }, []);

  const showCustom = useCallback((render) => {
    setModal({ kind: 'custom', render });
  }, []);

  return (
    <ModalContext.Provider value={{ showConfirm, showForm, showCustom, close }}>
      {children}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
             onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)' }}>
            {modal.kind === 'confirm' && (
              <div className="p-6">
                <h3 className="text-lg font-bold mb-3">{modal.title}</h3>
                <div className="text-gray-600 mb-6" dangerouslySetInnerHTML={{ __html: modal.body }} />
                <div className="flex gap-3">
                  <button className={`btn ${modal.danger ? 'btn-danger' : 'btn-primary'} flex-1`}
                          onClick={() => { close(); modal.onConfirm && modal.onConfirm(); }}>
                    {modal.confirmText}
                  </button>
                  <button className="btn btn-secondary flex-1" onClick={close}>{modal.cancelText}</button>
                </div>
              </div>
            )}
            {modal.kind === 'form' && (
              <FormModal modal={modal} close={close} />
            )}
            {modal.kind === 'custom' && modal.render(close)}
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

function FormModal({ modal, close }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {};
    for (const [k, v] of formData.entries()) data[k] = v;
    close();
    if (modal.onSubmit) modal.onSubmit(data);
  };
  return (
    <form className="p-6" onSubmit={handleSubmit}>
      <h3 className="text-lg font-bold mb-4">{modal.title}</h3>
      {modal.fields.map((f, i) => (
        <div key={i} className="mb-4">
          <label className="input-label">{f.label}</label>
          {f.type === 'select' ? (
            <select className="input" name={f.name} defaultValue={f.value}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea className="input" name={f.name} rows={3} placeholder={f.placeholder || ''} defaultValue={f.value || ''} />
          ) : f.type === 'file' ? (
            <input type="file" className="input" name={f.name} accept={f.accept || '*'} />
          ) : (
            <input
              type={f.type || 'text'}
              className="input"
              name={f.name}
              defaultValue={f.value || ''}
              placeholder={f.placeholder || ''}
              required={f.required}
              step={f.step}
            />
          )}
        </div>
      ))}
      <div className="flex gap-3 mt-6">
        <button type="submit" className="btn btn-primary flex-1">{modal.submitText}</button>
        <button type="button" className="btn btn-secondary flex-1" onClick={close}>Отмена</button>
      </div>
    </form>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
