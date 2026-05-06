import 'server-only'

import { prisma } from '@/lib/prisma'
import type { ContentEditorData, ContentType, FamilyConfigData } from '@/lib/content-types'

const DEFAULT_MODULES: FamilyConfigData = {
  moduleStories: true,
  moduleDiary: true,
  moduleRecipes: true,
  moduleMedia: true,
  moduleObjects: true,
  moduleLinks: true,
  moduleAudioVideo: true,    // v3.1+ pipeline conectado (sin transcoding)
  moduleExportImport: false,
  moduleSearch: true,
}

export type ModuleKey = keyof FamilyConfigData
export type SupportedEditorType = ContentEditorData['type']

export async function getFamilyModules(familyId: string): Promise<FamilyConfigData> {
  const config = await prisma.familyConfig.findUnique({
    where: { familyId },
    select: {
      moduleStories: true,
      moduleDiary: true,
      moduleRecipes: true,
      moduleMedia: true,
      moduleObjects: true,
      moduleLinks: true,
      moduleAudioVideo: true,
      moduleExportImport: true,
      moduleSearch: true,
    },
  })

  return config ?? DEFAULT_MODULES
}

export function getModuleForEditorType(type: SupportedEditorType): ModuleKey {
  switch (type) {
    case 'STORY':
    case 'SOURCE':
      return 'moduleStories'
    case 'DIARY':
    case 'INTERVIEW':
      return 'moduleDiary'
    case 'RECIPE':
      return 'moduleRecipes'
    case 'OBJECT':
      return 'moduleObjects'
    case 'IMPORTANT_LINK':
      return 'moduleLinks'
  }
}

export function getModuleForContentType(type: ContentType): ModuleKey {
  switch (type) {
    case 'STORY':
    case 'SOURCE':
      return 'moduleStories'
    case 'DIARY':
    case 'INTERVIEW':
      return 'moduleDiary'
    case 'RECIPE':
      return 'moduleRecipes'
    case 'OBJECT':
      return 'moduleObjects'
  }
}

export async function assertModuleEnabled(
  familyId: string,
  moduleKey: ModuleKey,
  message?: string
): Promise<void> {
  const modules = await getFamilyModules(familyId)
  if (!modules[moduleKey]) {
    throw new Error(message ?? 'Este modulo esta desactivado para esta familia.')
  }
}
