FROM php:8.3-fpm-alpine

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    nginx \
    supervisor \
    postgresql-dev \
    libxml2-dev \
    @force-install \
    bash

RUN docker-php-ext-install pdo pdo_pgsql pdo_mysql xml

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www

# Copy project files
COPY . .

# Install production dependencies
RUN composer install --no-dev --optimize-autoloader

# Setup Nginx and Supervisor configurations
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./supervisor.conf /etc/supervisor/conf.d/supervisor.conf

# Set permissions
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisor.conf"]