/**
 * Extracts important information from errors, especially axios errors, to avoid logging too much data
 * @param error The error object to extract information from
 * @returns A simplified error object with only important information
 */
export function extractErrorInfo(error: any): Record<string, unknown> {
  if (!error) {
    return { message: 'Unknown error' };
  }

  // Handle axios errors specifically
  if (error.isAxiosError) {
    // Base error information
    const errorInfo: Record<string, unknown> = {};
    errorInfo.type = 'axios';

    // Response information (if available)
    if (error.response) {
      errorInfo.response = {
        status: error.response.status,
        statusText: error.response.statusText,
        stack: error.stack,
        // Only include response data if it's small and relevant
        data:
          typeof error.response.data === 'string' && error.response.data.length < 300
            ? error.response.data
            : typeof error.response.data === 'object'
              ? JSON.stringify(error.response.data).substring(0, 300) + (JSON.stringify(error.response.data).length > 300 ? '...' : '')
              : '[Response data too large or not serializable]',
      };
    }

    // Network error information
    if (error.code) {
      errorInfo.code = error.code;
    }
    return errorInfo;
  } else {
    return error;
  }
}

export function extractMondayErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  // Handle flattened Monday error structure
  const errorCode = error.error_code || 'UnknownError';
  const columnName = error?.error_data?.column_name;
  const columnValue = error?.error_data?.column_value;
  const errorMessage = error.error_message;

  if (errorMessage) {
    let err = errorCode;
    if (columnName) {
      err += ` - Column name: ${columnName}`;
    }
    if (columnValue) {
      err += ` - Column value: ${columnValue}`;
    }
    return `${err} - Error message: ${errorMessage}`;
  }

  // Fallback to original message if Monday structure not found
  if (error.message) {
    return error.message;
  }

  return 'Unknown error';
}
