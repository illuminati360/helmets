import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import path from 'path';
import { get as _get } from 'http';
import { get as _gets } from 'https';
import url from 'url';
const gltfPipeline = require('gltf-pipeline');

const API_KEY = process.env['API_KEY'];

////////////////
//// utils
export function fetchJSON(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^application\/json/.test(contentType) && !/^text\/plain/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => {
				try {
					const parsedData = JSON.parse(rawData);
					resolve(parsedData);
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export function fetchGltf(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^model\/gltf\+json/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			let rawData: any = [];
			res.on('data', (chunk) => { rawData.push(chunk); });
			res.on('end', () => {
				try {
					resolve(Buffer.concat(rawData));
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export function fetchBin(_url: string): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!/^model\/gltf-binary/.test(contentType) && !/^application\/octet-stream/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
					`Expected application/json but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			let rawData: any = [];
			res.on('data', (chunk) => { rawData.push(chunk); });
			res.on('end', () => {
				try {
					resolve(Buffer.concat(rawData));
				} catch (e) {
					reject(e.message);
				}
			});
		});
	});
}

export async function getGltf(url: string){
	if (path.extname(path.basename(url)) == '.gltf'){
		return fetchGltf(url);
	}

	let buffer = await fetchBin(url);
	return gltfPipeline.glbToGltf(buffer)
		.then(function(results: any) {
			return results.gltf;
		});
}

export function joinUrl(baseUrl: string, uri: string){
    return new URL(uri, baseUrl).toString();
}

export function lineBreak(text: string, break_len: number =28){
	let ret = '';
	let lines = text.split('\n');
	lines.forEach((line,i) => {
		ret += line.slice(0, break_len);
		for (let i=1; i*break_len<line.length; i++){
			ret += '\n-' + line.slice(i*break_len, (i+1)*break_len);
		}
		if (i < lines.length - 1) ret += '\n'
	});
	return ret;
}
export function checkUserName(user: MRE.User, name: string){
    return user.name == name;
}

export function checkUserId(user: MRE.User, id: MRE.Guid){
	return user.id == id;
}

export function cumsum(array: number[]){
	let result: number[] = [];
	[0, ...array].reduce((a,b)=>{
		let s = a+b;
		result.push(s);
		return s;
	});
	return result;
}