const YA_API = "https://cloud-api.yandex.net/v1/disk/public/resources"
const REQUEST_HEADERS = {'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Mobile Safari/537.36'}

const CYR_2_LAT_MAP = {"Ё":"YO","Й":"I","Ц":"TS","У":"U","К":"K","Е":"E","Н":"N","Г":"G","Ш":"SH","Щ":"SCH","З":"Z","Х":"H","Ъ":"'","ё":"yo","й":"i","ц":"ts","у":"u","к":"k","е":"e","н":"n","г":"g","ш":"sh","щ":"sch","з":"z","х":"h","ъ":"'","Ф":"F","Ы":"I","В":"V","А":"A","П":"P","Р":"R","О":"O","Л":"L","Д":"D","Ж":"ZH","Э":"E","ф":"f","ы":"i","в":"v","а":"a","п":"p","р":"r","о":"o","л":"l","д":"d","ж":"zh","э":"e","Я":"Ya","Ч":"CH","С":"S","М":"M","И":"I","Т":"T","Ь":"'","Б":"B","Ю":"YU","я":"ya","ч":"ch","с":"s","м":"m","и":"i","т":"t","ь":"'","б":"b","ю":"yu"};

const MAX_SIZE_TO_HASH = 4_294_967_295

class Bar {
    line: string
    size: number
    encoder = new TextEncoder()
    current_size = 0
    part = .0.toFixed(3)
    part_size: number
    human_size: string

    constructor(size: number, len=50) {
        this.line = "      [" + "-".repeat(len) + "]"
        this.size = size
        this.part_size = size / len

        this.human_size = (this.size / 1024 / 1024).toFixed(1) + 'MB'
    }

    first_print() {
        Deno.stdout.writeSync(this.encoder.encode(this.line))
        Deno.stdout.writeSync(this.encoder.encode('\r\x1b[7C'))
    }

    print(new_bytes_length: number) {
        if (Math.floor(this.current_size / this.part_size) < 
            Math.floor((this.current_size += new_bytes_length) / this.part_size)) {
            Deno.stdout.writeSync(this.encoder.encode('='))
        }

        let point
        if (this.part != (point = (this.current_size / this.size).toFixed(3))) {
            this.part = point
            Deno.stdout.writeSync(this.encoder.encode(
                '\x1b[s'
                + '\r' + this.part + ' '
                + '\r' + '\x1b[' + this.line.length + 'C' + ' '
                + (this.current_size / 1024 / 1024).toFixed(1) + 'MB'
                + ' / ' + this.human_size
                + '\x1b[u'))
        }
    }

    last_print() {
        Deno.stdout.writeSync(this.encoder.encode('\n'))
    }
}

function last(a: Array<string>) {
    return a[a.length-1]
}

function to16 (number: number, length: number = 2, character: string = '0') {
    let result = number.toString(16)
    for (let i = result.length; i < length; ++i) {
        result = character + result
    }
    return result
}

async function download_file(url: string, file_name: string, size: number, verbose=false) {
    if (verbose) console.log(file_name, "|", decodeURI(url)) //url)
    const res = await fetch(url, {headers: REQUEST_HEADERS})
    const file = await Deno.open(file_name, { create: true, write: true })
    // await res.body?.pipeTo(file.writable)

    const bar = new Bar(size)
    bar.first_print()
    for await (const chunk of res.body) {
        file.write(chunk)
        bar.print(chunk.byteLength)
    }
    bar.last_print()

    file.close()
}

async function check_sha256(file: string, hash: string) {
    const input = await Deno.readFile(file)
    const a = await crypto.subtle.digest('sha-256', input)
    let e = ""
    for (const i of new Uint8Array(a)) {
        e += to16(i)
    }
    return e == hash
}

async function exists(path: string) {
    try {
        await Deno.stat(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false
        } else { throw error }
    }
    return true
}

function shorten_name(name: string, len: int) {
    const encoder = new TextEncoder()
    const short_name = name.split('')
    for (let i = short_name.length-1; i > 0 && encoder.encode(short_name.join('')).length >= len; i--) {
        if (CYR_2_LAT_MAP[short_name[i]] != undefined) {
            short_name[i] = CYR_2_LAT_MAP[short_name[i]]
        }
    }
    return short_name
}

enum Hash {
    NO,
    MD5,
    SHA256
}

async function list_files(url: string, path: string, folder_path: string, only_print_hash: Hash, do_reentry_hashes=false, ) {
    const _url = YA_API + "?public_key=" + url + "&path=" + encodeURIComponent(path) + "&limit=100"
    const site = await fetch(_url)
    const response = await site.json()

    const encoder = new TextEncoder()

    if (only_print_hash == Hash.NO && response._embedded.tota > 100) {
        console.log('----', response.name, ' exceeds limit of 100, download will be incomplete')
    }

    for (const item_id in response._embedded.items) {
        const item = response._embedded.items[item_id]
        if (only_print_hash == Hash.NO) {
            console.log(
                item.type=="dir" ? "# "+item.path : "-- "+item.name, //item.name,
                '|', item.type,
                '|', item.size,
                '|', (item.size / 1024 / 1024).toFixed(1) + 'MB')
        }

        if (item.type == "dir") {
            const new_folder = folder_path + '/' + item.name
            await Deno.mkdir(new_folder, { recursive: true }) 
            await list_files(url, item.path, new_folder, only_print_hash, do_reentry_hashes)

        } else if (item.type == "file") {
            let short_name
            if (encoder.encode(item.name).length >= 255) {
                short_name = shorten_name(item.name, 255).join('')
                if (only_print_hash == Hash.NO)
                    console.log('----', 'too long name, shorten to:', short_name)
            }
            const name = folder_path + '/' + ((short_name==undefined)?item.name:short_name)

            if (only_print_hash == Hash.MD5) {
                console.log(item.md5 + '  ' + name)
                continue
            }
            if (only_print_hash == Hash.SHA256) {
                console.log(item.sha256 + '  ' + name)
                continue
            }

            let should_download = false
            let stat_size

            if (!await exists(name)) {
                should_download = true
            } else 
            if ((stat_size = ((await Deno.stat(name)).size)) != item.size) {
                console.log('----', name, ': exists but wrong file size, removing and redownloading')
                await Deno.remove(name)
                should_download = true
            } else 
            if (do_reentry_hashes && stat_size < MAX_SIZE_TO_HASH) {
                if (await check_sha256(name, item.sha256)) {
                    console.log('----', name, ': already exists and ok')
                } else {
                    console.log('----', name, ': exist but not ok, removing and redownloading')
                    await Deno.remove(name)
                    should_download = true
                }
            } else {
                console.log('----', name, ': already exists, WONT CHECK')
            }

            if (should_download) {
                await download_file(item.file, name, item.size)
                console.log('----', 'SHA256 is',
                    (item.size < MAX_SIZE_TO_HASH)?(await check_sha256(name, item.sha256)?"ok":"not ok"):"WONT CHECK")
            }
        }
    }
}

async function main() {
    // url = "https://disk.yandex.ru/d/XXXXXXXXXXXXXX"
    let url = undefined
    let output = undefined
    let recheck_sha256 = false
    let only_print_hash = Hash.NO

    for (const arg of Deno.args) {
        switch (arg) {
        case '-h':
            console.log('usage: deno run %file%.ts [-a] URL [OUTPUT]')
            console.log('  URL')
            console.log('    url for dist to download')
            console.log('  OUTPUT')
            console.log('    output folder')
            console.log('    ')
            console.log('  -a, --check-sha256-for-already-existing-files')
            console.log('    Recheck sha256 for already downloaded files, when script rerun.')
            console.log('  -n, --only-print-hash')
            console.log('    Do not download files, only print SHA256 hashes')
            Deno.exit()
            break

        case '-a':
            /* falls through */
        case '--check-sha256-for-already-existing-files':
            recheck_sha256 = true
            break

        case '-n':
            /* falls through */
        case '--only-print-hash':
            only_print_hash = Hash.SHA256

        default:
            if (url == undefined) {
                url = arg
            } else if (output == undefined) {
                output = arg
            }
        }
    }

    if (url == undefined) {
        Deno.exit()
    }

    if (output == undefined) {
        output = last(url.split('/'))
    }

    console.log(url, output, check_sha256, recheck_sha256, only_print_hash)

    await Deno.mkdir(output, { recursive: true })
    await list_files(url, "", output, only_print_hash, recheck_sha256)
}

await main()

