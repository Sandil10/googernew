/**
 * Standardized API Response Handler
 * Ensures consistent response format for Web and Mobile applications
 */

const success = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

const error = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors,
        timestamp: new Date().toISOString()
    });
};

const validationError = (res, errors) => {
    return error(res, 'Validation failed', 400, errors);
};

module.exports = {
    success,
    error,
    validationError
};
