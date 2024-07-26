class ActionResponse<T> {
  success: boolean;
  message: string;
  data: T | null;

  constructor(success: boolean, message: string, data: T | null = null) {
    this.success = success;
    this.message = message;
    this.data = data;
  }

  static success(message: string, data: any = null) {
    return {
      success: true,
      message,
      data,
    };
  }

  static error(message: string, data: any = null) {
    return {
      success: false,
      message,
      data,
    };
  }
}

export default ActionResponse;
