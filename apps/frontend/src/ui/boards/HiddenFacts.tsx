import { createContext, useContext } from 'react'

import { NO_HIDDEN_FACTS, type HiddenFacts } from '@/application/hiddenFacts'

/** Set by a list of tasks that keeps to a board, a label, a priority… */
export const HiddenFactsContext = createContext<HiddenFacts>(NO_HIDDEN_FACTS)

export const useHiddenFacts = (): HiddenFacts => useContext(HiddenFactsContext)
