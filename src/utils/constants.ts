export const DefaultServerUrl = '';

export enum ResponseErrorCode {
  /** User is not logged in. */
  UnLogin = 40011,
}

/** Get the category menu list. */
export const yapiApiGetMenu = '/api/interface/getCatMenu';
/** Get basic project information. */
export const yapiApiGetProject = '/api/project/get';
/** Get interface data (with detailed interface definition). */
export const yapiApiInterfaceDetail = '/api/interface/get';
/** Get the interface list under a category. */
export const yapiApiCatInterfaceList = '/api/interface/list_cat';
/** Get the interface list data under a project. */
export const yapiApiProjectInterfaceList = '/api/interface/list';
/** Get the menu list under a project. */
export const yapiApiProjectMenuList = '/api/interface/list_menu';
/** Export all interfaces. */
export const yapiApiExport = '/api/plugin/export';
/** Get the project token. */
export const yapiApiToken = '/api/project/token';
