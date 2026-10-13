'use client';
import { createContext, useContext } from 'react';
import type { ResearchEvent, ResearchFocus } from '@/lib/researchWorkspace';

export const ResearchFocusContext = createContext<{focus:ResearchFocus|null;investigate:(event:ResearchEvent)=>void}>({focus:null,investigate:()=>{}});
export const useResearchFocus = () => useContext(ResearchFocusContext);
