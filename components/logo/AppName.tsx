import clsx from 'clsx'

const AppName = ({ className }: { className?: string }) => {
  return <span className={clsx('font-bold', className)}>Airacter</span>
}

export default AppName
