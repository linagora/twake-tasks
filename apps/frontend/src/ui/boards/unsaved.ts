import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef
} from 'react'

type Mark = (id: string, unsaved: boolean) => void

export const UnsavedContext = createContext<Mark>(() => undefined)

export function useUnsavedFields(): { mark: Mark; any: () => boolean } {
  const fields = useRef(new Set<string>())
  const mark = useCallback<Mark>((id, unsaved) => {
    if (unsaved) fields.current.add(id)
    else fields.current.delete(id)
  }, [])
  const any = useCallback(() => fields.current.size > 0, [])
  return { mark, any }
}

export function useUnsaved(unsaved: boolean): void {
  const mark = useContext(UnsavedContext)
  const id = useId()
  useEffect(() => {
    mark(id, unsaved)
    return () => {
      mark(id, false)
    }
  }, [mark, id, unsaved])
}
