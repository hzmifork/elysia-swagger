/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Elysia, type InternalRoute } from 'elysia'

import { SwaggerUIRender } from './swagger'
import { ScalarRender } from './scalar'

import { filterPaths, registerSchemaPath } from './utils'

import type { OpenAPIV3 } from 'openapi-types'
import type { ReferenceConfiguration } from '@scalar/types'
import type { ElysiaSwaggerConfig } from './types'
import { join } from 'pathe';

/**
 * Plugin for [elysia](https://github.com/elysiajs/elysia) that auto-generate Swagger page.
 *
 * @see https://github.com/elysiajs/elysia-swagger
 */
export const swagger = async <Path extends string = '/swagger'>(
	{
		provider = 'scalar',
		scalarVersion = 'latest',
		scalarCDN = '',
		scalarConfig = {},
		documentation = {},
		version = '5.9.0',
		excludeStaticFile = true,
		path = '/swagger' as Path,
		exclude = [],
		swaggerOptions = {},
		theme = `https://unpkg.com/swagger-ui-dist@${version}/swagger-ui.css`,
		autoDarkMode = true,
		excludeMethods = ['OPTIONS'],
		excludeTags = []
	}: ElysiaSwaggerConfig<Path> = {
		provider: 'scalar',
		scalarVersion: 'latest',
		scalarCDN: '',
		scalarConfig: {},
		documentation: {},
		version: '5.9.0',
		excludeStaticFile: true,
		path: '/swagger' as Path,
		exclude: [],
		swaggerOptions: {},
		autoDarkMode: true,
		excludeMethods: ['OPTIONS'],
		excludeTags: []
	}
) => {
	const schema = {}
	let totalRoutes = 0

	if (!version)
		version = `https://unpkg.com/swagger-ui-dist@${version}/swagger-ui.css`

	const info = {
		title: 'Elysia Documentation',
		description: 'Development documentation',
		version: '0.0.0',
		...documentation.info
	}

	const app = new Elysia({ name: '@elysiajs/swagger' })
	const appPrefix = app.config.prefix ?? "/"
	const prefixedPath = join(appPrefix, path)

	app.get(path, function documentation(request) {
		// External Prefix, if the app is behind a reverse proxy
		// For example in Traefik, the prefix is set in the header `X-Forwarded-Prefix`
		const extPrefix = request.headers["x-forwarded-prefix"] ?? "/"
		const relativePath = join(extPrefix, prefixedPath, "json")

		const combinedSwaggerOptions = {
			url: relativePath,
			dom_id: '#swagger-ui',
			...swaggerOptions
		}

		const stringifiedSwaggerOptions = JSON.stringify(
			combinedSwaggerOptions,
			(key, value) => {
				if (typeof value == 'function') return undefined

				return value
			}
		)

		const scalarConfiguration: ReferenceConfiguration = {
			spec: {
				...scalarConfig.spec,
				url: relativePath
			},
			...scalarConfig,
			// so we can showcase the elysia theme
			// @ts-expect-error
			_integration: 'elysiajs'
		}

		return new Response(
			provider === 'swagger-ui'
				? SwaggerUIRender(
						info,
						version,
						theme,
						stringifiedSwaggerOptions,
						autoDarkMode
					)
				: ScalarRender(info, scalarVersion, scalarConfiguration, scalarCDN),
			{
				headers: {
					'content-type': 'text/html; charset=utf8'
				}
			}
		)
	}).get(path === '/' ? '/json' : `${path}/json`, function openAPISchema(request) {
		// External Prefix, if the app is behind a reverse proxy
		// For example in Traefik, the prefix is set in the header `X-Forwarded-Prefix`
		const extPrefix = request.headers["x-forwarded-prefix"] ?? "/"
		const relativePath = join(extPrefix, prefixedPath)

		// @ts-expect-error Private property
		const routes = app.getGlobalRoutes() as InternalRoute[]

		if (routes.length !== totalRoutes) {
			const ALLOWED_METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH', 'TRACE']
			totalRoutes = routes.length

			routes.forEach((route: InternalRoute) => {
				if (route.hooks?.detail?.hide === true) return
				// TODO: route.hooks?.detail?.hide !== false  add ability to hide: false to prevent excluding
				if (excludeMethods.includes(route.method)) return
				if (ALLOWED_METHODS.includes(route.method) === false && route.method !== 'ALL') return

				if (route.method === 'ALL') {
					ALLOWED_METHODS.forEach((method) => {
						registerSchemaPath({
							schema,
							hook: route.hooks,
							method,
							path: join(extPrefix, appPrefix, route.path),
							// @ts-ignore
							models: app.definitions?.type,
							contentType: route.hooks.type
						})
					})
					return
				}

				registerSchemaPath({
					schema,
					hook: route.hooks,
					method: route.method,
					path: join(extPrefix, appPrefix, route.path),
					// @ts-ignore
					models: app.definitions?.type,
					contentType: route.hooks.type
				})
			})
		}

		return {
			openapi: '3.0.3',
			...{
				...documentation,
				tags: documentation.tags?.filter(
					(tag) => !excludeTags?.includes(tag?.name)
				),
				info: {
					title: 'Elysia Documentation',
					description: 'Development documentation',
					version: '0.0.0',
					...documentation.info
				}
			},
			paths: {
				...filterPaths(schema, relativePath, {
					excludeStaticFile,
					exclude: Array.isArray(exclude) ? exclude : [exclude]
				}),
				...documentation.paths
			},
			components: {
				...documentation.components,
				schemas: {
					// @ts-ignore
					...app.definitions?.type,
					...documentation.components?.schemas
				}
			}
		} satisfies OpenAPIV3.Document
	})

	return app
}

export type { ElysiaSwaggerConfig }
export default swagger
