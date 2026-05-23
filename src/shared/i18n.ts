import { normalizeAppLanguage, type AppLanguage } from './appLanguage';

type CopyDictionary = {
  // Shared brand labels
  actionsLabel: string;
  openLabel: string;

  // Content menu
  correctAction: string;
  correctDescription: string;
  translateAction: string;
  noChanges: string;
  noText: string;
  selectToPreserveEntities: string;
  corrected: string;
  translated: string;
  updateFailed: string;
  unreachable: string;
  noResponse: string;
  copyAction: string;
  copyDone: string;
  closeLabel: string;
  resultCorrectTitle: string;
  resultTranslateTitle: string;

  // Background errors
  apiKeyMissing: string;
  correctionDisabled: string;
  gatewayAuthFailed: string;
  gatewayContactFailed: string;
  gatewayInvalid: string;
  gatewayRateLimited: string;
  gatewayServerFailed: string;
  gatewayTimeout: string;
  keyRequired: string;
  noModelOutput: string;
  ortaDisabled: string;
  siteDisabled: string;
  transformFailed: string;
  translationDisabled: string;

  // Options page
  addButton: string;
  apiKeyLabel: string;
  appLanguageLabel: string;
  behaviorTitle: string;
  blockedKicker: string;
  connectionTitle: string;
  correctionTitle: string;
  correctionDescription: string;
  domainPatternLabel: string;
  enableTitle: string;
  enableDescription: string;
  exclusionsTitle: string;
  featuresKicker: string;
  heroCopy: string;
  modelLabel: string;
  removeButton: string;
  saveButton: string;
  settingsTitle: string;
  settingsTitleDocument: string;
  targetLanguageLabel: string;
  testConnectionButton: string;
  translationTitle: string;
  translationDescription: string;

  // Built-in protected sites
  builtinBlockedKicker: string;
  builtinBlockedTitle: string;
  builtinBlockedDescription: string;
  builtinShowList: string;
  builtinAllowButton: string;
  builtinBlockButton: string;
  builtinOverrideAdded: string;
  builtinOverrideRemoved: string;

  // Options toasts / status
  apiKeySaved: string;
  apiKeyToggleHide: string;
  apiKeyToggleShow: string;
  apiMissing: string;
  apiPending: string;
  apiSaved: string;
  apiStatusError: string;
  apiStatusLoading: string;
  apiStatusReady: string;
  appLanguageSaved: string;
  blockedDomainInvalid: string;
  blockedEmpty: string;
  blockedExisting: string;
  blockedRemoved: string;
  blockedSaved: string;
  connectionReady: string;
  targetLanguageSaved: string;

  // Popup
  popupEnabled: string;
  popupCorrect: string;
  popupTranslate: string;
  popupActiveOn: string;
  popupDisabledOn: string;
  popupNotAvailable: string;
  popupEnableHere: string;
  popupDisableHere: string;
  popupOpenSettings: string;
};

const copies: Record<AppLanguage, CopyDictionary> = {
  es: {
    actionsLabel: 'Acciones de Orta',
    openLabel: 'Abrir Orta',
    correctAction: 'Corregir',
    correctDescription: 'Ortografía y puntuación',
    translateAction: 'Traducir',
    noChanges: 'Sin cambios sugeridos.',
    noText: 'No hay texto para procesar.',
    selectToPreserveEntities: 'Selecciona el texto a corregir para conservar menciones, hashtags y enlaces.',
    corrected: 'Texto corregido.',
    translated: 'Texto traducido.',
    updateFailed: 'No se pudo procesar la selección.',
    unreachable: 'No se pudo contactar Orta.',
    noResponse: 'Orta no respondió.',
    copyAction: 'Copiar',
    copyDone: 'Copiado',
    closeLabel: 'Cerrar',
    resultCorrectTitle: 'Corregido',
    resultTranslateTitle: 'Traducido',
    apiKeyMissing: 'Configura tu API Key de Vercel AI Gateway en Orta.',
    correctionDisabled: 'La corrección ortográfica está desactivada.',
    gatewayAuthFailed: 'La API Key de Vercel AI Gateway no es válida o no tiene permisos.',
    gatewayContactFailed: 'No se pudo contactar Vercel AI Gateway.',
    gatewayInvalid: 'No se pudo validar la API Key con el modelo configurado.',
    gatewayRateLimited: 'Vercel AI Gateway limitó temporalmente las solicitudes. Intenta de nuevo en unos segundos.',
    gatewayServerFailed: 'Vercel AI Gateway no respondió correctamente. Intenta de nuevo más tarde.',
    gatewayTimeout: 'Vercel AI Gateway tardó demasiado en responder.',
    keyRequired: 'Agrega una API Key de Vercel AI Gateway.',
    noModelOutput: 'El modelo no devolvió texto utilizable.',
    ortaDisabled: 'Orta está desactivado.',
    siteDisabled: 'Orta está desactivado en este sitio.',
    transformFailed: 'No se pudo procesar el texto.',
    translationDisabled: 'La traducción está desactivada.',
    addButton: 'Agregar',
    apiKeyLabel: 'API Key',
    appLanguageLabel: 'Idioma de Orta',
    behaviorTitle: 'Comportamiento',
    blockedKicker: 'Sitios desactivados',
    connectionTitle: 'Conexión',
    correctionTitle: 'Corrección ortográfica',
    correctionDescription: 'Reescribe conservando idioma, tono y formato.',
    domainPatternLabel: 'Dominio o patrón',
    enableTitle: 'Activar Orta',
    enableDescription: 'Muestra una burbuja al seleccionar texto en cualquier página.',
    exclusionsTitle: 'Exclusiones',
    featuresKicker: 'Funciones',
    heroCopy: 'Corrige y traduce texto directamente donde escribes, sin sacar el foco de la página.',
    modelLabel: 'Modelo',
    removeButton: 'Quitar',
    saveButton: 'Guardar',
    settingsTitle: 'Ajustes',
    settingsTitleDocument: 'Orta · Ajustes',
    targetLanguageLabel: 'Idioma destino',
    testConnectionButton: 'Probar conexión',
    translationTitle: 'Traducción',
    translationDescription: 'Traduce el texto seleccionado al idioma destino.',
    builtinBlockedKicker: 'Seguridad por defecto',
    builtinBlockedTitle: 'Sitios bloqueados por seguridad',
    builtinBlockedDescription:
      'Orta no aparece en estos sitios por defecto: bancos, pagos, inicio de sesión y gobierno. Puedes activarlo en uno específico si lo necesitas.',
    builtinShowList: 'Ver lista completa',
    builtinAllowButton: 'Permitir aquí',
    builtinBlockButton: 'Volver a bloquear',
    builtinOverrideAdded: 'Orta activado en este sitio.',
    builtinOverrideRemoved: 'Orta vuelve a estar bloqueado en este sitio.',
    apiKeySaved: 'API Key guardada en este navegador.',
    apiKeyToggleHide: 'Ocultar API Key',
    apiKeyToggleShow: 'Mostrar API Key',
    apiMissing: 'Agrega una API Key antes de probar.',
    apiPending: 'Sin configurar',
    apiSaved: 'Guardada',
    apiStatusError: 'Error',
    apiStatusLoading: 'Validando',
    apiStatusReady: 'Lista',
    appLanguageSaved: 'Idioma de Orta actualizado.',
    blockedDomainInvalid: 'Escribe un dominio válido.',
    blockedEmpty: 'No hay sitios desactivados.',
    blockedExisting: 'Ese sitio ya está desactivado.',
    blockedRemoved: 'Sitio activado de nuevo.',
    blockedSaved: 'Sitio desactivado.',
    connectionReady: 'Conexión lista',
    targetLanguageSaved: 'Idioma destino',
    popupEnabled: 'Orta activo',
    popupCorrect: 'Corregir',
    popupTranslate: 'Traducir',
    popupActiveOn: 'Activo en',
    popupDisabledOn: 'Desactivado en',
    popupNotAvailable: 'No disponible en esta página',
    popupEnableHere: 'Activar en este sitio',
    popupDisableHere: 'Desactivar en este sitio',
    popupOpenSettings: 'Abrir ajustes',
  },
  en: {
    actionsLabel: 'Orta actions',
    openLabel: 'Open Orta',
    correctAction: 'Correct',
    correctDescription: 'Spelling and punctuation',
    translateAction: 'Translate',
    noChanges: 'No suggested changes.',
    noText: 'There is no text to process.',
    selectToPreserveEntities: 'Select the text to correct to preserve mentions, hashtags, and links.',
    corrected: 'Text corrected.',
    translated: 'Text translated.',
    updateFailed: 'Could not process the selection.',
    unreachable: 'Could not contact Orta.',
    noResponse: 'Orta did not respond.',
    copyAction: 'Copy',
    copyDone: 'Copied',
    closeLabel: 'Close',
    resultCorrectTitle: 'Corrected',
    resultTranslateTitle: 'Translated',
    apiKeyMissing: 'Set your Vercel AI Gateway API key in Orta.',
    correctionDisabled: 'Spelling correction is disabled.',
    gatewayAuthFailed: 'The Vercel AI Gateway API key is invalid or lacks permissions.',
    gatewayContactFailed: 'Could not contact Vercel AI Gateway.',
    gatewayInvalid: 'Could not validate the API key with the configured model.',
    gatewayRateLimited: 'Vercel AI Gateway temporarily rate-limited requests. Try again in a few seconds.',
    gatewayServerFailed: 'Vercel AI Gateway did not respond correctly. Try again later.',
    gatewayTimeout: 'Vercel AI Gateway took too long to respond.',
    keyRequired: 'Add a Vercel AI Gateway API key.',
    noModelOutput: 'The model did not return usable text.',
    ortaDisabled: 'Orta is disabled.',
    siteDisabled: 'Orta is disabled on this site.',
    transformFailed: 'Could not process the text.',
    translationDisabled: 'Translation is disabled.',
    addButton: 'Add',
    apiKeyLabel: 'API Key',
    appLanguageLabel: 'Orta language',
    behaviorTitle: 'Behavior',
    blockedKicker: 'Disabled sites',
    connectionTitle: 'Connection',
    correctionTitle: 'Spelling correction',
    correctionDescription: 'Rewrites while preserving language, tone, and formatting.',
    domainPatternLabel: 'Domain or pattern',
    enableTitle: 'Enable Orta',
    enableDescription: 'Shows a bubble when you select text on any page.',
    exclusionsTitle: 'Exclusions',
    featuresKicker: 'Features',
    heroCopy: 'Correct and translate text directly where you write, without leaving the page.',
    modelLabel: 'Model',
    removeButton: 'Remove',
    saveButton: 'Save',
    settingsTitle: 'Settings',
    settingsTitleDocument: 'Orta · Settings',
    targetLanguageLabel: 'Target language',
    testConnectionButton: 'Test connection',
    translationTitle: 'Translation',
    translationDescription: 'Translates the selected text to the target language.',
    builtinBlockedKicker: 'Default protection',
    builtinBlockedTitle: 'Sites blocked for safety',
    builtinBlockedDescription:
      "Orta is hidden on these sites by default: banks, payments, sign-in, and government. You can allow it on a specific one if you need to.",
    builtinShowList: 'Show full list',
    builtinAllowButton: 'Allow here',
    builtinBlockButton: 'Block again',
    builtinOverrideAdded: 'Orta enabled on this site.',
    builtinOverrideRemoved: 'Orta is blocked again on this site.',
    apiKeySaved: 'API key saved in this browser.',
    apiKeyToggleHide: 'Hide API key',
    apiKeyToggleShow: 'Show API key',
    apiMissing: 'Add an API key before testing.',
    apiPending: 'Not configured',
    apiSaved: 'Saved',
    apiStatusError: 'Error',
    apiStatusLoading: 'Validating',
    apiStatusReady: 'Ready',
    appLanguageSaved: 'Orta language updated.',
    blockedDomainInvalid: 'Enter a valid domain.',
    blockedEmpty: 'No disabled sites.',
    blockedExisting: 'That site is already disabled.',
    blockedRemoved: 'Site enabled again.',
    blockedSaved: 'Site disabled.',
    connectionReady: 'Connection ready',
    targetLanguageSaved: 'Target language',
    popupEnabled: 'Orta enabled',
    popupCorrect: 'Correct',
    popupTranslate: 'Translate',
    popupActiveOn: 'Active on',
    popupDisabledOn: 'Disabled on',
    popupNotAvailable: 'Not available on this page',
    popupEnableHere: 'Enable on this site',
    popupDisableHere: 'Disable on this site',
    popupOpenSettings: 'Open settings',
  },
  pt: {
    actionsLabel: 'Ações do Orta',
    openLabel: 'Abrir Orta',
    correctAction: 'Corrigir',
    correctDescription: 'Ortografia e pontuação',
    translateAction: 'Traduzir',
    noChanges: 'Sem alterações sugeridas.',
    noText: 'Não há texto para processar.',
    selectToPreserveEntities: 'Selecione o texto para corrigir e preservar menções, hashtags e links.',
    corrected: 'Texto corrigido.',
    translated: 'Texto traduzido.',
    updateFailed: 'Não foi possível processar a seleção.',
    unreachable: 'Não foi possível contatar o Orta.',
    noResponse: 'Orta não respondeu.',
    copyAction: 'Copiar',
    copyDone: 'Copiado',
    closeLabel: 'Fechar',
    resultCorrectTitle: 'Corrigido',
    resultTranslateTitle: 'Traduzido',
    apiKeyMissing: 'Configure sua API Key do Vercel AI Gateway no Orta.',
    correctionDisabled: 'A correção ortográfica está desativada.',
    gatewayAuthFailed: 'A API Key do Vercel AI Gateway não é válida ou não tem permissões.',
    gatewayContactFailed: 'Não foi possível contatar o Vercel AI Gateway.',
    gatewayInvalid: 'Não foi possível validar a API Key com o modelo configurado.',
    gatewayRateLimited: 'O Vercel AI Gateway limitou temporariamente as solicitações. Tente novamente em alguns segundos.',
    gatewayServerFailed: 'O Vercel AI Gateway não respondeu corretamente. Tente novamente mais tarde.',
    gatewayTimeout: 'O Vercel AI Gateway demorou demais para responder.',
    keyRequired: 'Adicione uma API Key do Vercel AI Gateway.',
    noModelOutput: 'O modelo não retornou texto utilizável.',
    ortaDisabled: 'Orta está desativado.',
    siteDisabled: 'Orta está desativado neste site.',
    transformFailed: 'Não foi possível processar o texto.',
    translationDisabled: 'A tradução está desativada.',
    addButton: 'Adicionar',
    apiKeyLabel: 'API Key',
    appLanguageLabel: 'Idioma do Orta',
    behaviorTitle: 'Comportamento',
    blockedKicker: 'Sites desativados',
    connectionTitle: 'Conexão',
    correctionTitle: 'Correção ortográfica',
    correctionDescription: 'Reescreve preservando idioma, tom e formato.',
    domainPatternLabel: 'Domínio ou padrão',
    enableTitle: 'Ativar Orta',
    enableDescription: 'Mostra uma bolha ao selecionar texto em qualquer página.',
    exclusionsTitle: 'Exclusões',
    featuresKicker: 'Funções',
    heroCopy: 'Corrige e traduz texto diretamente onde você escreve, sem sair da página.',
    modelLabel: 'Modelo',
    removeButton: 'Remover',
    saveButton: 'Salvar',
    settingsTitle: 'Ajustes',
    settingsTitleDocument: 'Orta · Ajustes',
    targetLanguageLabel: 'Idioma destino',
    testConnectionButton: 'Testar conexão',
    translationTitle: 'Tradução',
    translationDescription: 'Traduz o texto selecionado para o idioma destino.',
    builtinBlockedKicker: 'Proteção padrão',
    builtinBlockedTitle: 'Sites bloqueados por segurança',
    builtinBlockedDescription:
      'O Orta não aparece nestes sites por padrão: bancos, pagamentos, login e governo. Você pode ativá-lo em um específico se precisar.',
    builtinShowList: 'Ver lista completa',
    builtinAllowButton: 'Permitir aqui',
    builtinBlockButton: 'Bloquear novamente',
    builtinOverrideAdded: 'Orta ativado neste site.',
    builtinOverrideRemoved: 'Orta volta a ser bloqueado neste site.',
    apiKeySaved: 'API Key salva neste navegador.',
    apiKeyToggleHide: 'Ocultar API Key',
    apiKeyToggleShow: 'Mostrar API Key',
    apiMissing: 'Adicione uma API Key antes de testar.',
    apiPending: 'Não configurada',
    apiSaved: 'Salva',
    apiStatusError: 'Erro',
    apiStatusLoading: 'Validando',
    apiStatusReady: 'Pronta',
    appLanguageSaved: 'Idioma do Orta atualizado.',
    blockedDomainInvalid: 'Digite um domínio válido.',
    blockedEmpty: 'Não há sites desativados.',
    blockedExisting: 'Esse site já está desativado.',
    blockedRemoved: 'Site ativado novamente.',
    blockedSaved: 'Site desativado.',
    connectionReady: 'Conexão pronta',
    targetLanguageSaved: 'Idioma destino',
    popupEnabled: 'Orta ativo',
    popupCorrect: 'Corrigir',
    popupTranslate: 'Traduzir',
    popupActiveOn: 'Ativo em',
    popupDisabledOn: 'Desativado em',
    popupNotAvailable: 'Não disponível nesta página',
    popupEnableHere: 'Ativar neste site',
    popupDisableHere: 'Desativar neste site',
    popupOpenSettings: 'Abrir ajustes',
  },
};

export const getCopy = (language: string): CopyDictionary => copies[normalizeAppLanguage(language)];

export type { CopyDictionary };
