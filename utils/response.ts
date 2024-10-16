/**
 * A generic class representing the response of an action.
 *
 * @template T - The type of the data contained in the response.
 */
class ActionResponse<T> {
  success: boolean;
  message: string;
  data: T | null;

  /**
   * Constructs an instance of ActionResponse.
   *
   * @param {boolean} success - Indicates if the action was successful.
   * @param {string} message - A message providing additional information about the action.
   * @param {T | null} [data=null] - The data returned by the action, if any.
   */
  constructor(success: boolean, message: string, data: T | null = null) {
    this.success = success;
    this.message = message;
    this.data = data;
  }

  /**
   * Creates a successful action response.
   *
   * @param {string} message - A message providing additional information about the success.
   * @param {any} [data=null] - The data returned by the successful action, if any.
   * @returns {ActionResponse<any>} An object representing a successful action response.
   */
  static success(message: string, data: any = null): ActionResponse<any> {
    return {
      success: true,
      message,
      data,
    };
  }

  /**
   * Creates an error action response.
   *
   * @param {string} message - A message providing additional information about the error.
   * @param {any} [data=null] - The data returned by the failed action, if any.
   * @returns {ActionResponse<any>} An object representing an error action response.
   */
  static error(message: string, data: any = null): ActionResponse<any> {
    return {
      success: false,
      message,
      data,
    };
  }
}

export default ActionResponse;
